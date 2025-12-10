/**
 * LiveBind - Declarative Reactive Forms
 * A Livewire-like experience for any backend. Works standalone or with Unpoly/HTMX.
 *
 * CORE:
 *   data-live-form       - Container element (required)
 *   data-live-url        - Endpoint URL (required)
 *   data-live-delay      - Debounce delay in ms (default: 300)
 *   data-live-throttle   - Throttle delay in ms (alternative to debounce)
 *   data-live-scoped     - Restrict output updates to container only
 *   data-live-defer      - Don't auto-update, wait for data-live-submit
 *   data-live-poll="ms"  - Auto-refresh at interval
 *
 * INPUTS:
 *   data-live-input      - Input triggers updates on change
 *   data-live-model="key" - Two-way binding with server state
 *   data-live-min-length="N" - Minimum chars before triggering
 *   data-live-show-on-focus="key" - Show target on focus
 *
 * OUTPUTS:
 *   data-live-output="key" - Update with JSON response value
 *   data-live-target="key" - Replace innerHTML with HTML response
 *   data-live-error="field" - Show validation error for field
 *   data-live-dropdown   - Dropdown behavior (keyboard nav)
 *   data-live-transition="name" - CSS transition classes
 *   data-live-loading    - Show during requests
 *   data-live-debounce-loading="ms" - Delay showing loading (prevents flicker)
 *
 * ACTIONS:
 *   data-live-action     - AJAX action URL
 *   data-live-method     - HTTP method (default: POST)
 *   data-live-param-*    - Action parameters
 *   data-live-confirm="msg" - Confirm dialog before action
 *   data-live-optimistic="key:delta" - Optimistic UI update
 *   data-live-navigate   - Update browser URL
 *   data-live-clear      - Reset targets to initial state
 *   data-live-submit     - Explicit submit for defer mode
 *
 * NAVIGATION:
 *   data-live-link       - SPA-style link navigation (on <a> tags)
 *   data-live-link-target="selector" - Target element for link content
 *   data-live-preload    - Preload page on hover (on <a> tags)
 *
 * CACHING:
 *   data-live-cache      - Cache GET responses (on container)
 *   data-live-cache-ttl="ms" - Cache TTL in ms (default: 60000)
 *
 * BATCH:
 *   data-live-batch="name" - Multi-select checkbox
 *   data-live-batch-action="name" - Collect batch values for action
 *
 * STATE:
 *   data-live-dirty      - Show when form has changes
 *   data-live-pristine   - Show/enable when unchanged
 *   data-live-offline    - Show when offline
 *
 * UPLOAD:
 *   data-live-upload     - File upload with progress
 *   data-live-progress="key" - Show upload percentage
 *
 * LAZY:
 *   data-live-lazy       - Load when scrolled into view
 *
 * ALPINE.JS:
 *   data-live-entangle="key" - Sync Alpine.js data with LiveBind response
 *
 * EVENTS:
 *   livebind:beforeUpdate, livebind:afterUpdate, livebind:action,
 *   livebind:actionComplete, livebind:error, livebind:dirty,
 *   livebind:pristine, livebind:offline, livebind:online, livebind:navigate
 */
class LiveBind {
  // ==================== STATIC STATE ====================
  static isOnline = navigator.onLine;
  static offlineElements = new Set();
  static _globalInitialized = false;
  static _autoCompilerInitialized = false;
  static _requestCache = new Map(); // URL -> { data, timestamp }
  static _preloadCache = new Map(); // URL -> Promise

  // ==================== ADAPTERS ====================

  /**
   * Platform-agnostic request adapter
   * Priority: Unpoly > HTMX > fetch
   */
  static async request({ url, method = "POST", params = {} }) {
    // Serialize params - handle arrays properly for PHP (ids[] notation)
    const serializeParams = (obj) => {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          value.forEach((v) => searchParams.append(`${key}[]`, v));
        } else {
          searchParams.append(key, value);
        }
      }
      return searchParams;
    };

    // Flatten params for frameworks that don't handle arrays
    const flattenParams = (obj) => {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          value.forEach((v, i) => {
            result[`${key}[${i}]`] = v;
          });
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    // Unpoly - note: up.request throws on non-2xx responses
    if (window.up?.request) {
      try {
        // Flatten arrays for Unpoly
        const resp = await up.request({ url, method, params: flattenParams(params) });
        return {
          text: resp.text,
          status: resp.status || 200,
          contentType: resp.contentType || "",
        };
      } catch (error) {
        // Unpoly throws up.Response for non-2xx, check multiple properties
        const resp = error.response || error;
        if (resp && typeof resp.text === "string") {
          return {
            text: resp.text,
            status: resp.status || 422,
            contentType: resp.contentType || "",
          };
        }
        throw error;
      }
    }

    // HTMX - use fetch since htmx.ajax is fire-and-forget
    // Fall through to fetch

    // Vanilla fetch
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/html",
    };
    if (csrfToken) {
      headers["X-CSRF-TOKEN"] = csrfToken;
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: serializeParams(params),
    });

    return {
      text: await resp.text(),
      status: resp.status,
      contentType: resp.headers.get("Content-Type") || "",
    };
  }

  /**
   * Platform-agnostic DOM morph adapter
   * Priority: idiomorph > morphdom > innerHTML
   * Note: Unpoly's up.morph() has different semantics (needs element, not HTML string)
   */
  static morph(target, html) {
    // idiomorph library (best option for HTML string morphing)
    if (window.Idiomorph?.morph) {
      Idiomorph.morph(target, html, { morphStyle: "innerHTML" });
      return;
    }

    // morphdom library
    if (window.morphdom) {
      const template = document.createElement("template");
      template.innerHTML = html;
      window.morphdom(target, template.content.firstElementChild || template.content, {
        childrenOnly: true,
      });
      return;
    }

    // Fallback: innerHTML
    target.innerHTML = html;
  }

  // ==================== GLOBAL INIT ====================

  /**
   * Initialize global listeners (online/offline, auto-compiler)
   */
  static initGlobal() {
    if (this._globalInitialized) return;
    this._globalInitialized = true;

    // Online/offline detection
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.offlineElements.forEach((el) => {
        el.hidden = true;
        el.style.display = "none";
      });
      document.querySelectorAll("[data-live-form]").forEach((container) => {
        this.emit(container, "online", {});
      });
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.offlineElements.forEach((el) => {
        el.hidden = false;
        el.style.display = "";
      });
      document.querySelectorAll("[data-live-form]").forEach((container) => {
        this.emit(container, "offline", {});
      });
    });

    // Auto-compiler for dynamically added elements
    this.initAutoCompiler();

    // SPA-style link navigation
    this.setupLinkNavigation();

    // Preload on hover
    this.setupPreload();
  }

  /**
   * Auto-compiler using MutationObserver
   * Initializes new [data-live-form] elements automatically
   */
  static initAutoCompiler() {
    if (this._autoCompilerInitialized) return;
    this._autoCompilerInitialized = true;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return; // Only elements

          // Check if the added node itself is a live form
          if (node.matches?.("[data-live-form]")) {
            this.initialize(node);
          }

          // Check children
          node.querySelectorAll?.("[data-live-form]").forEach((el) => {
            this.initialize(el);
          });

          // Initialize lazy elements
          if (node.matches?.("[data-live-lazy]")) {
            this.setupLazy(node);
          }
          node.querySelectorAll?.("[data-live-lazy]").forEach((el) => {
            this.setupLazy(el);
          });
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ==================== UTILITIES ====================

  static debounce(fn, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  static throttle(fn, wait) {
    let lastCall = 0;
    let timeout;
    return function (...args) {
      const now = Date.now();
      const remaining = wait - (now - lastCall);
      if (remaining <= 0) {
        lastCall = now;
        fn.apply(this, args);
      } else if (!timeout) {
        timeout = setTimeout(() => {
          lastCall = Date.now();
          timeout = null;
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  static emit(container, eventName, detail = {}) {
    const event = new CustomEvent(`livebind:${eventName}`, {
      bubbles: true,
      cancelable: true,
      detail: { container, ...detail },
    });
    return container.dispatchEvent(event);
  }

  // ==================== OUTPUT UPDATES ====================

  static updateOutputs(data, container = null) {
    const scope = container?.hasAttribute("data-live-scoped") ? container : document;

    Object.entries(data).forEach(([key, value]) => {
      // data-live-output
      scope.querySelectorAll(`[data-live-output="${key}"]`).forEach((el) => {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.value = value;
        } else if (el.tagName === "SELECT") {
          el.value = value;
        } else if (el.tagName === "PROGRESS") {
          el.value = value;
        } else {
          el.textContent = value;
        }
      });

      // data-live-model (two-way binding)
      scope.querySelectorAll(`[data-live-model="${key}"]`).forEach((el) => {
        if (el.type === "checkbox") {
          el.checked = Boolean(value);
        } else if (el.type === "radio") {
          el.checked = el.value === String(value);
        } else {
          el.value = value;
        }
      });
    });

    // Sync with Alpine.js if available
    if (container) {
      this.updateAlpineEntangle(container, data);
    }
  }

  // ==================== VALIDATION ERRORS ====================

  /**
   * Display validation errors from server response
   * Expects: { errors: { field: ["message", ...] } }
   */
  static displayErrors(container, errors) {
    // Clear existing errors
    container.querySelectorAll("[data-live-error]").forEach((el) => {
      el.textContent = "";
      el.hidden = true;
      el.style.display = "none";
    });

    // Remove invalid classes
    container.querySelectorAll(".live-invalid").forEach((el) => {
      el.classList.remove("live-invalid");
    });

    if (!errors) return;

    // Display new errors
    Object.entries(errors).forEach(([field, messages]) => {
      const errorEl = container.querySelector(`[data-live-error="${field}"]`);
      if (errorEl && messages.length > 0) {
        errorEl.textContent = messages[0];
        errorEl.hidden = false;
        errorEl.style.display = "";
      }

      // Mark input as invalid
      const input =
        container.querySelector(`[name="${field}"]`) ||
        container.querySelector(`[data-live-model="${field}"]`);
      if (input) {
        input.classList.add("live-invalid");
      }
    });
  }

  /**
   * Clear all validation errors
   */
  static clearErrors(container) {
    this.displayErrors(container, null);
  }

  // ==================== TRANSITIONS ====================

  static async applyTransition(target, transitionName, callback) {
    if (!transitionName) {
      await callback();
      return;
    }

    // Leave phase
    target.classList.add(`${transitionName}-leave`);
    await new Promise((r) => requestAnimationFrame(r));
    target.classList.add(`${transitionName}-leave-active`);
    await new Promise((r) => setTimeout(r, 150));
    target.classList.remove(`${transitionName}-leave`, `${transitionName}-leave-active`);

    // Execute update
    await callback();

    // Enter phase
    target.classList.add(`${transitionName}-enter`);
    await new Promise((r) => requestAnimationFrame(r));
    target.classList.add(`${transitionName}-enter-active`);
    await new Promise((r) => setTimeout(r, 150));
    target.classList.remove(`${transitionName}-enter`, `${transitionName}-enter-active`);
  }

  static updateTarget(container, key, html, specificTarget = null) {
    const target = specificTarget || container.querySelector(`[data-live-target="${key}"]`);
    if (!target) {
      console.warn("LiveBind: Target not found for key", key);
      return;
    }

    const transitionName = target.getAttribute("data-live-transition");

    this.applyTransition(target, transitionName, () => {
      this.morph(target, html);

      if (html.trim()) {
        target.style.display = "";
        target.removeAttribute("hidden");
      }
    });
  }

  // ==================== LOADING STATE ====================

  static setLoading(container, isLoading) {
    const loadingEl = container.querySelector("[data-live-loading]");

    // Support debounced loading to prevent flicker on fast responses
    const debounceMs = parseInt(container.getAttribute("data-live-debounce-loading"), 10);

    if (isLoading) {
      // Clear any pending hide timeout
      if (container._loadingHideTimeout) {
        clearTimeout(container._loadingHideTimeout);
        container._loadingHideTimeout = null;
      }

      if (debounceMs > 0) {
        // Delay showing loading indicator
        container._loadingShowTimeout = setTimeout(() => {
          if (loadingEl) loadingEl.style.display = "";
          container.classList.add("live-loading");
        }, debounceMs);
      } else {
        // Show immediately
        if (loadingEl) loadingEl.style.display = "";
        container.classList.add("live-loading");
      }
    } else {
      // Clear any pending show timeout
      if (container._loadingShowTimeout) {
        clearTimeout(container._loadingShowTimeout);
        container._loadingShowTimeout = null;
      }

      // Hide loading
      if (loadingEl) loadingEl.style.display = "none";
      container.classList.remove("live-loading");
    }
  }

  // ==================== MIN LENGTH ====================

  static meetsMinLength(input) {
    const minLength = parseInt(input.getAttribute("data-live-min-length"), 10);
    if (isNaN(minLength)) return true;
    return input.value.length >= minLength;
  }

  // ==================== DIRTY TRACKING ====================

  static setupDirtyTracking(container) {
    const inputs = container.querySelectorAll("input, textarea, select, [data-live-model]");
    const initialValues = new Map();

    inputs.forEach((input) => {
      if (input.type === "checkbox" || input.type === "radio") {
        initialValues.set(input, input.checked);
      } else {
        initialValues.set(input, input.value);
      }
    });

    container._liveBindInitialValues = initialValues;
    container._liveBindIsDirty = false;

    const checkDirty = () => {
      let isDirty = false;
      initialValues.forEach((initialValue, input) => {
        const currentValue =
          input.type === "checkbox" || input.type === "radio" ? input.checked : input.value;
        if (currentValue !== initialValue) isDirty = true;
      });

      if (isDirty !== container._liveBindIsDirty) {
        container._liveBindIsDirty = isDirty;
        this.updateDirtyUI(container, isDirty);
        this.emit(container, isDirty ? "dirty" : "pristine", {});
      }
    };

    inputs.forEach((input) => {
      input.addEventListener("input", checkDirty);
      input.addEventListener("change", checkDirty);
    });

    this.updateDirtyUI(container, false);
  }

  static updateDirtyUI(container, isDirty) {
    container.querySelectorAll("[data-live-dirty]").forEach((el) => {
      el.hidden = !isDirty;
      el.style.display = isDirty ? "" : "none";
    });

    container.querySelectorAll("[data-live-pristine]").forEach((el) => {
      if (el.tagName === "BUTTON" || el.tagName === "INPUT") {
        el.disabled = isDirty;
      } else {
        el.hidden = isDirty;
        el.style.display = !isDirty ? "" : "none";
      }
    });
  }

  static resetDirtyState(container) {
    const inputs = container.querySelectorAll("input, textarea, select, [data-live-model]");
    const initialValues = container._liveBindInitialValues;

    if (initialValues) {
      inputs.forEach((input) => {
        if (input.type === "checkbox" || input.type === "radio") {
          initialValues.set(input, input.checked);
        } else {
          initialValues.set(input, input.value);
        }
      });
    }

    container._liveBindIsDirty = false;
    this.updateDirtyUI(container, false);
    this.clearErrors(container);
  }

  // ==================== OPTIMISTIC UI ====================

  static applyOptimistic(container, optimisticSpec) {
    if (!optimisticSpec) return () => {};

    const rollbacks = [];

    optimisticSpec.split(",").forEach((spec) => {
      const [key, delta] = spec.split(":").map((s) => s.trim());
      const el = container.querySelector(`[data-live-output="${key}"]`);

      if (el) {
        const originalValue = el.textContent;
        rollbacks.push(() => (el.textContent = originalValue));

        if (delta.startsWith("+") || delta.startsWith("-")) {
          const numDelta = parseInt(delta, 10);
          const currentVal = parseInt(el.textContent, 10) || 0;
          el.textContent = String(currentVal + numDelta);
        } else {
          el.textContent = delta;
        }
      }
    });

    return () => rollbacks.forEach((rb) => rb());
  }

  // ==================== NAVIGATION ====================

  /**
   * Update browser URL without reload
   */
  static navigate(url) {
    const newUrl = new URL(url, window.location.origin);
    window.history.pushState({}, "", newUrl.pathname + newUrl.search);
  }

  /**
   * Setup SPA-style link navigation
   * Intercepts clicks on [data-live-link] anchors and loads content via fetch
   */
  static setupLinkNavigation() {
    if (this._linkNavInitialized) return;
    this._linkNavInitialized = true;

    // Handle link clicks
    document.addEventListener("click", async (e) => {
      const link = e.target.closest("a[data-live-link]");
      if (!link) return;

      // Skip if modifier keys held (let browser handle)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Skip external links
      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("//")) return;

      e.preventDefault();

      await this.navigateToUrl(href, link);
    });

    // Handle back/forward buttons
    window.addEventListener("popstate", async () => {
      await this.navigateToUrl(window.location.pathname + window.location.search, null, false);
    });
  }

  /**
   * Navigate to a URL and update page content
   */
  static async navigateToUrl(url, linkEl = null, pushState = true) {
    // Determine target selector
    const targetSelector =
      linkEl?.getAttribute("data-live-link-target") || linkEl?.getAttribute("data-live-link") || "main";
    const target =
      targetSelector === "true" || targetSelector === ""
        ? document.querySelector("main") || document.body
        : document.querySelector(targetSelector);

    if (!target) {
      console.warn("LiveBind: Navigation target not found:", targetSelector);
      window.location.href = url;
      return;
    }

    // Emit navigate event
    const event = new CustomEvent("livebind:navigate", {
      bubbles: true,
      cancelable: true,
      detail: { url, target },
    });
    if (!document.dispatchEvent(event)) return;

    // Get transition classes
    const transitionName = linkEl?.getAttribute("data-live-transition") || "live";

    try {
      // Apply leaving transition
      target.classList.add(`${transitionName}-leave`);
      target.classList.add("live-loading");

      // Fetch new page
      const response = await this.request({ url, method: "GET", params: {} });

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Parse response
      const parser = new DOMParser();
      const doc = parser.parseFromString(response.text, "text/html");

      // Find content in response
      const newContent = doc.querySelector(targetSelector) || doc.querySelector("main") || doc.body;

      // Update URL
      if (pushState) {
        window.history.pushState({}, doc.title || "", url);
      }

      // Update page title
      if (doc.title) {
        document.title = doc.title;
      }

      // Apply entering transition
      target.classList.remove(`${transitionName}-leave`);
      target.classList.add(`${transitionName}-enter`);

      // Morph content
      this.morph(target, newContent.innerHTML);

      // Initialize any new LiveBind forms
      target.querySelectorAll("[data-live-form]").forEach((form) => {
        if (!form._liveBindInitialized) {
          this.initialize(form);
        }
      });

      // Remove transition class after animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          target.classList.remove(`${transitionName}-enter`);
          target.classList.remove("live-loading");
        });
      });
    } catch (error) {
      console.error("LiveBind: Navigation failed", error);
      target.classList.remove(`${transitionName}-leave`);
      target.classList.remove("live-loading");

      // Fallback to full page navigation
      window.location.href = url;
    }
  }

  // ==================== PRELOAD ====================

  /**
   * Setup preload on hover for links with data-live-preload
   */
  static setupPreload() {
    if (this._preloadInitialized) return;
    this._preloadInitialized = true;

    document.addEventListener("mouseenter", (e) => {
      // e.target might be a text node, which doesn't have closest()
      if (!(e.target instanceof Element)) return;
      const link = e.target.closest("a[data-live-preload]");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("//")) return;

      // Don't preload if already cached
      if (this._preloadCache.has(href)) return;

      // Start preloading
      const preloadPromise = this.request({ url: href, method: "GET", params: {} });
      this._preloadCache.set(href, preloadPromise);

      // Clear from cache after 30 seconds
      setTimeout(() => {
        this._preloadCache.delete(href);
      }, 30000);
    }, true);
  }

  /**
   * Get preloaded response if available
   */
  static getPreloaded(url) {
    return this._preloadCache.get(url);
  }

  // ==================== REQUEST CACHING ====================

  /**
   * Get cached response for URL
   */
  static getCached(url, ttl = 60000) {
    const cached = this._requestCache.get(url);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > ttl) {
      this._requestCache.delete(url);
      return null;
    }

    return cached.data;
  }

  /**
   * Store response in cache
   */
  static setCache(url, data) {
    this._requestCache.set(url, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache for URL or all if no URL provided
   */
  static clearCache(url = null) {
    if (url) {
      this._requestCache.delete(url);
    } else {
      this._requestCache.clear();
    }
  }

  // ==================== ALPINE.JS ENTANGLE ====================

  /**
   * Sync Alpine.js component data with LiveBind response
   * Usage: <div x-data="{ count: 0 }" data-live-entangle="count">
   */
  static updateAlpineEntangle(container, data) {
    if (!window.Alpine) return;

    // Find all elements with data-live-entangle
    container.querySelectorAll("[data-live-entangle]").forEach((el) => {
      const key = el.getAttribute("data-live-entangle");
      if (!(key in data)) return;

      // Find Alpine component
      const alpineData = Alpine.$data(el);
      if (!alpineData) return;

      // Update Alpine data
      if (key in alpineData) {
        alpineData[key] = data[key];
      }
    });

    // Also check if container itself has entangle
    if (container.hasAttribute("data-live-entangle")) {
      const key = container.getAttribute("data-live-entangle");
      if (key in data) {
        const alpineData = Alpine.$data(container);
        if (alpineData && key in alpineData) {
          alpineData[key] = data[key];
        }
      }
    }
  }

  /**
   * Setup two-way binding: Alpine -> LiveBind
   * Watches Alpine data changes and syncs to hidden inputs
   */
  static setupAlpineWatchers(container) {
    if (!window.Alpine) return;

    container.querySelectorAll("[data-live-entangle]").forEach((el) => {
      const key = el.getAttribute("data-live-entangle");
      const alpineData = Alpine.$data(el);
      if (!alpineData || !(key in alpineData)) return;

      // Watch for changes using Alpine's effect
      Alpine.effect(() => {
        const value = alpineData[key];

        // Find matching hidden input or create one
        let input = container.querySelector(`input[name="${key}"]`);
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = key;
          const form = container.tagName === "FORM" ? container : container.querySelector("form");
          if (form) form.appendChild(input);
        }

        input.value = value;
      });
    });
  }

  // ==================== BATCH COLLECTION ====================

  static collectBatchValues(container, batchName) {
    const values = [];
    container.querySelectorAll(`[data-live-batch="${batchName}"]:checked`).forEach((el) => {
      values.push(el.value);
    });
    return values;
  }

  // ==================== PERFORM UPDATE ====================

  static async performUpdate(container, url, triggerInput = null) {
    if (!this.isOnline) {
      console.warn("LiveBind: Offline, skipping update");
      return;
    }

    if (triggerInput && !this.meetsMinLength(triggerInput)) {
      container.querySelectorAll("[data-live-target]").forEach((target) => {
        if (target.hasAttribute("data-live-dropdown")) {
          target.style.display = "none";
        }
      });
      return;
    }

    const form = container.tagName === "FORM" ? container : container.querySelector("form");
    if (!form) {
      console.error("LiveBind: No form found in container");
      return;
    }

    const formData = new FormData(form);
    const params = {};
    for (const [key, value] of formData.entries()) {
      if (!(value instanceof File)) {
        params[key] = value;
      }
    }

    if (!this.emit(container, "beforeUpdate", { url })) return;

    try {
      this.setLoading(container, true);
      this.clearErrors(container);

      const response = await this.request({ url, method: "POST", params });

      // Handle validation errors (422)
      if (response.status === 422) {
        try {
          const data = JSON.parse(response.text);
          if (data.errors) {
            this.displayErrors(container, data.errors);
            this.emit(container, "error", { error: data, status: 422 });
            return;
          }
        } catch (e) {
          // Not JSON, continue
        }
      }

      if (response.contentType.includes("application/json")) {
        const data = JSON.parse(response.text);
        this.updateOutputs(data, container);
        this.emit(container, "afterUpdate", { data, contentType: "json" });
      } else {
        const targets = container.querySelectorAll("[data-live-target]");
        if (targets.length > 0) {
          const targetToUpdate =
            targets.length === 1
              ? targets[0]
              : Array.from(targets).find((t) => t.getAttribute("data-live-target") === "results") ||
                targets[0];

          const key = targetToUpdate.getAttribute("data-live-target") || "default";
          this.updateTarget(container, key, response.text, targetToUpdate);
          this.emit(container, "afterUpdate", { data: response.text, contentType: "html" });
        }
      }
    } catch (error) {
      console.error("LiveBind: Update failed", error);
      this.emit(container, "error", { error });
    } finally {
      this.setLoading(container, false);
    }
  }

  // ==================== FILE UPLOAD ====================

  static async performUpload(container, input, url) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const progressKey = input.getAttribute("data-live-progress");
    const form = container.tagName === "FORM" ? container : container.querySelector("form");
    if (!form) return;

    const formData = new FormData(form);

    try {
      this.setLoading(container, true);

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable && progressKey) {
            const percent = Math.round((e.loaded / e.total) * 100);
            this.updateOutputs({ [progressKey]: percent }, container);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const contentType = xhr.getResponseHeader("Content-Type") || "";
            if (contentType.includes("application/json")) {
              const data = JSON.parse(xhr.responseText);
              this.updateOutputs(data, container);
            }
            this.emit(container, "afterUpdate", { data: xhr.responseText, contentType: "upload" });
            resolve();
          } else if (xhr.status === 422) {
            try {
              const data = JSON.parse(xhr.responseText);
              this.displayErrors(container, data.errors);
            } catch (e) {}
            reject(new Error("Validation failed"));
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        xhr.open("POST", url);
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        if (csrfToken) xhr.setRequestHeader("X-CSRF-TOKEN", csrfToken);

        xhr.send(formData);
      });
    } catch (error) {
      console.error("LiveBind: Upload failed", error);
      this.emit(container, "error", { error });
    } finally {
      this.setLoading(container, false);
      if (progressKey) this.updateOutputs({ [progressKey]: 0 }, container);
    }
  }

  // ==================== POLLING ====================

  static setupPolling(container, url, interval) {
    let pollTimer = null;
    let isVisible = !document.hidden;

    const poll = () => {
      if (isVisible && this.isOnline) {
        this.performUpdate(container, url);
      }
    };

    const startPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(poll, interval);
    };

    document.addEventListener("visibilitychange", () => {
      isVisible = !document.hidden;
      if (isVisible) {
        poll();
        startPolling();
      } else if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    });

    startPolling();
    container._liveBindPollTimer = pollTimer;
  }

  // ==================== LAZY LOADING ====================

  static setupLazy(element) {
    if (element._liveBindLazyInitialized) return;
    element._liveBindLazyInitialized = true;

    const url = element.getAttribute("data-live-url");
    if (!url) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observer.unobserve(element);
            this.performUpdate(element, url);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
  }

  // ==================== DROPDOWN ====================

  static setupDropdown(container, target) {
    let focusedIndex = -1;

    const getFocusableItems = () =>
      target.querySelectorAll("button, a, [tabindex]:not([tabindex='-1'])");

    const show = () => {
      if (target.innerHTML.trim()) {
        target.style.display = "";
        target.removeAttribute("hidden");
      }
    };

    const hide = () => {
      target.style.display = "none";
      focusedIndex = -1;
    };

    const focusItem = (index) => {
      const items = getFocusableItems();
      if (index >= 0 && index < items.length) {
        items[index].focus();
        focusedIndex = index;
      }
    };

    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) hide();
    });

    container.addEventListener("keydown", (event) => {
      const items = getFocusableItems();
      if (items.length === 0) return;

      switch (event.key) {
        case "Escape":
          hide();
          container.querySelector("[data-live-input]")?.focus();
          event.preventDefault();
          break;
        case "ArrowDown":
          if (target.style.display === "none") show();
          focusItem(Math.min(focusedIndex + 1, items.length - 1));
          event.preventDefault();
          break;
        case "ArrowUp":
          if (focusedIndex > 0) focusItem(focusedIndex - 1);
          else {
            container.querySelector("[data-live-input]")?.focus();
            focusedIndex = -1;
          }
          event.preventDefault();
          break;
        case "Enter":
          if (focusedIndex >= 0 && items[focusedIndex]) {
            items[focusedIndex].click();
            event.preventDefault();
          }
          break;
      }
    });

    const observer = new MutationObserver(() => {
      focusedIndex = -1;
      if (target.innerHTML.trim()) show();
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  // ==================== INITIALIZE ====================

  static initialize(container) {
    this.initGlobal();

    if (container._liveBindInitialized) return;
    container._liveBindInitialized = true;

    const url = container.getAttribute("data-live-url");
    const isDeferred = container.hasAttribute("data-live-defer");
    const isLazy = container.hasAttribute("data-live-lazy");

    if (isLazy) {
      this.setupLazy(container);
      return;
    }

    if (!url) {
      console.error("LiveBind: Missing data-live-url attribute on", container);
      return;
    }

    // Offline indicators
    container.querySelectorAll("[data-live-offline]").forEach((el) => {
      this.offlineElements.add(el);
      el.hidden = this.isOnline;
      el.style.display = this.isOnline ? "none" : "";
    });

    // Dirty tracking
    this.setupDirtyTracking(container);

    // Alpine.js integration
    this.setupAlpineWatchers(container);

    // Polling
    const pollInterval = parseInt(container.getAttribute("data-live-poll"), 10);
    if (pollInterval > 0) this.setupPolling(container, url, pollInterval);

    // Initial states
    const initialStates = new Map();
    container.querySelectorAll("[data-live-target]").forEach((target) => {
      const key = target.getAttribute("data-live-target");
      initialStates.set(key, { innerHTML: target.innerHTML, display: target.style.display });
      if (target.hasAttribute("data-live-dropdown")) this.setupDropdown(container, target);
    });
    container._liveBindInitialStates = initialStates;

    // Input handlers
    const delay = parseInt(container.getAttribute("data-live-delay") || "300", 10);
    const throttleMs = parseInt(container.getAttribute("data-live-throttle"), 10);
    const inputs = container.querySelectorAll("[data-live-input], [data-live-model]");

    inputs.forEach((input) => {
      const updateFn = () => this.performUpdate(container, url, input);
      const limitedUpdate = throttleMs
        ? this.throttle(updateFn, throttleMs)
        : this.debounce(updateFn, delay);

      const eventType =
        input.tagName === "SELECT" || input.type === "checkbox" || input.type === "radio"
          ? "change"
          : "input";

      if (!isDeferred) input.addEventListener(eventType, limitedUpdate);

      const showOnFocusKey = input.getAttribute("data-live-show-on-focus");
      if (showOnFocusKey) {
        input.addEventListener("focus", () => {
          const target = container.querySelector(`[data-live-target="${showOnFocusKey}"]`);
          if (target && target.innerHTML.trim()) {
            target.style.display = "";
            target.removeAttribute("hidden");
          }
        });
      }

      if (input.hasAttribute("data-live-upload")) {
        input.addEventListener("change", () => this.performUpload(container, input, url));
      }
    });

    this.setupActionDelegation(container);
    this.setLoading(container, false);
  }

  // ==================== ACTION DELEGATION ====================

  static setupActionDelegation(container) {
    const url = container.getAttribute("data-live-url");

    container.addEventListener("click", async (event) => {
      // data-live-submit
      const submitEl = event.target.closest("[data-live-submit]");
      if (submitEl) {
        event.preventDefault();
        this.performUpdate(container, url);
        return;
      }

      // data-live-clear
      const clearEl = event.target.closest("[data-live-clear]");
      if (clearEl) {
        event.preventDefault();
        event.stopPropagation();

        const targetKey = clearEl.getAttribute("data-live-clear");
        const initialStates = container._liveBindInitialStates;

        if (initialStates) {
          if (targetKey) {
            const target = container.querySelector(`[data-live-target="${targetKey}"]`);
            const initial = initialStates.get(targetKey);
            if (target && initial) {
              target.innerHTML = initial.innerHTML;
              target.style.display = initial.display;
            }
          } else {
            initialStates.forEach((initial, key) => {
              const target = container.querySelector(`[data-live-target="${key}"]`);
              if (target) {
                target.innerHTML = initial.innerHTML;
                target.style.display = initial.display;
              }
            });
          }
        }

        container.querySelectorAll("[data-live-input]").forEach((input) => (input.value = ""));
        this.clearErrors(container);
        return;
      }

      // data-live-action
      const actionEl = event.target.closest("[data-live-action]");
      if (!actionEl) return;

      event.preventDefault();
      event.stopPropagation();

      // Confirmation
      const confirmMsg = actionEl.getAttribute("data-live-confirm");
      if (confirmMsg && !window.confirm(confirmMsg)) return;

      const actionUrl = actionEl.getAttribute("data-live-action");
      const actionMethod = actionEl.getAttribute("data-live-method") || "POST";
      const shouldNavigate = actionEl.hasAttribute("data-live-navigate");
      const optimisticSpec = actionEl.getAttribute("data-live-optimistic");
      const batchActionName = actionEl.getAttribute("data-live-batch-action");

      const actionParams = {};

      // First, collect form data (so explicit params can override)
      const form = container.tagName === "FORM" ? container : container.querySelector("form");
      if (form) {
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
          if (!(value instanceof File)) {
            actionParams[key] = value;
          }
        }
      }

      // Then collect data-live-param-* attributes (override form values)
      for (const attr of actionEl.attributes) {
        if (attr.name.startsWith("data-live-param-")) {
          actionParams[attr.name.replace("data-live-param-", "")] = attr.value;
        }
      }

      // Collect batch values
      if (batchActionName) {
        actionParams[batchActionName] = this.collectBatchValues(container, batchActionName);
      }

      if (!this.emit(container, "action", { actionEl, url: actionUrl, params: actionParams })) {
        return;
      }

      const rollback = this.applyOptimistic(container, optimisticSpec);

      try {
        this.setLoading(container, true);
        this.clearErrors(container);

        const response = await this.request({
          url: actionUrl,
          method: actionMethod,
          params: actionParams,
        });

        // Handle validation errors
        if (response.status === 422) {
          try {
            const data = JSON.parse(response.text);
            if (data.errors) {
              this.displayErrors(container, data.errors);
              rollback();
              this.emit(container, "error", { error: data, status: 422 });
              return;
            }
          } catch (e) {}
        }

        // Handle JSON responses - update outputs
        const contentType = response.contentType || "";
        if (contentType.includes("application/json")) {
          try {
            const data = JSON.parse(response.text);
            this.updateOutputs(data, container);
          } catch (e) {
            console.warn("LiveBind: Failed to parse JSON response", e);
          }
        }

        // Update targets (for HTML responses)
        const targets = container.querySelectorAll("[data-live-target]");
        if (targets.length > 0 && response.text && !contentType.includes("application/json")) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(response.text, "text/html");

          targets.forEach((target) => {
            const key = target.getAttribute("data-live-target");
            const responseEl =
              doc.querySelector(`[data-live-target="${key}"]`) || doc.querySelector(`#${key}`);
            if (responseEl) {
              this.morph(target, responseEl.innerHTML);
            }
          });
        }

        this.emit(container, "actionComplete", { actionEl, response });

        if (shouldNavigate) this.navigate(actionUrl);

        container.querySelectorAll("[data-live-dropdown]").forEach((dd) => {
          dd.style.display = "none";
        });

        const searchInput = container.querySelector("[data-live-input][type='text']");
        if (searchInput) searchInput.value = "";

        this.resetDirtyState(container);
      } catch (error) {
        console.error("LiveBind: Action failed", error);
        rollback();
        this.emit(container, "error", { error });
      } finally {
        this.setLoading(container, false);
      }
    });
  }
}

export default LiveBind;
