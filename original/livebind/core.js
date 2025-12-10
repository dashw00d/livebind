/**
 * LiveBind Core
 * Base class with request adapter, morph adapter, events, and utilities
 * This is the minimal foundation - add plugins for more features
 */

class LiveBindCore {
  // ==================== STATIC STATE ====================
  static isOnline = navigator.onLine;
  static offlineElements = new Set();
  static _globalInitialized = false;
  static _plugins = [];

  // ==================== PLUGIN SYSTEM ====================

  /**
   * Register a plugin to extend LiveBind functionality
   * @param {Object} plugin - { name, setup(LiveBind), initialize(container) }
   */
  static use(plugin) {
    if (this._plugins.find((p) => p.name === plugin.name)) return this;
    this._plugins.push(plugin);

    // Run setup immediately if already initialized
    if (plugin.setup) {
      plugin.setup(this);
    }

    return this; // Chainable
  }

  /**
   * Get registered plugin by name
   */
  static getPlugin(name) {
    return this._plugins.find((p) => p.name === name);
  }

  // ==================== REQUEST ADAPTER ====================

  /**
   * Platform-agnostic request adapter
   * Priority: Unpoly > fetch
   */
  static async request({ url, method = "POST", params = {} }) {
    // Serialize params - handle arrays properly for PHP
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

    // Unpoly
    if (window.up?.request) {
      try {
        const resp = await up.request({ url, method, params: flattenParams(params) });
        return {
          text: resp.text,
          status: resp.status || 200,
          contentType: resp.contentType || "",
        };
      } catch (error) {
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

  // ==================== MORPH ADAPTER ====================

  /**
   * Platform-agnostic DOM morph adapter
   * Priority: idiomorph > morphdom > innerHTML
   */
  static morph(target, html) {
    if (window.Idiomorph?.morph) {
      Idiomorph.morph(target, html, { morphStyle: "innerHTML" });
      return;
    }

    if (window.morphdom) {
      const template = document.createElement("template");
      template.innerHTML = html;
      window.morphdom(target, template.content.firstElementChild || template.content, {
        childrenOnly: true,
      });
      return;
    }

    target.innerHTML = html;
  }

  // ==================== EVENTS ====================

  static emit(container, eventName, detail = {}) {
    const event = new CustomEvent(`livebind:${eventName}`, {
      bubbles: true,
      cancelable: true,
      detail,
    });
    container.dispatchEvent(event);
    return event;
  }

  // ==================== UTILITIES ====================

  static debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delay);
    };
  }

  static throttle(fn, limit) {
    let inThrottle = false;
    return (...args) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  // ==================== GLOBAL INITIALIZATION ====================

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

    // Run plugin global setups
    this._plugins.forEach((plugin) => {
      if (plugin.initGlobal) plugin.initGlobal(this);
    });
  }

  // ==================== OUTPUT UPDATES ====================

  static updateOutputs(data, container = null) {
    const scope = container?.hasAttribute("data-live-scoped") ? container : document;

    Object.entries(data).forEach(([key, value]) => {
      scope.querySelectorAll(`[data-live-output="${key}"]`).forEach((el) => {
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.value = value;
        } else if (el.tagName === "SELECT" || el.tagName === "PROGRESS") {
          el.value = value;
        } else {
          el.textContent = value;
        }
      });

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

    // Plugin hook for output updates
    this._plugins.forEach((plugin) => {
      if (plugin.onUpdateOutputs) plugin.onUpdateOutputs(this, data, container);
    });
  }

  // ==================== LOADING STATE ====================

  static setLoading(container, isLoading) {
    const loadingEl = container.querySelector("[data-live-loading]");
    const debounceMs = parseInt(container.getAttribute("data-live-debounce-loading"), 10);

    if (isLoading) {
      if (container._loadingHideTimeout) {
        clearTimeout(container._loadingHideTimeout);
        container._loadingHideTimeout = null;
      }

      if (debounceMs > 0) {
        container._loadingShowTimeout = setTimeout(() => {
          if (loadingEl) loadingEl.style.display = "";
          container.classList.add("live-loading");
        }, debounceMs);
      } else {
        if (loadingEl) loadingEl.style.display = "";
        container.classList.add("live-loading");
      }
    } else {
      if (container._loadingShowTimeout) {
        clearTimeout(container._loadingShowTimeout);
        container._loadingShowTimeout = null;
      }
      if (loadingEl) loadingEl.style.display = "none";
      container.classList.remove("live-loading");
    }
  }

  // ==================== INITIALIZE ====================

  static initialize(container) {
    this.initGlobal();

    if (container._liveBindInitialized) return;
    container._liveBindInitialized = true;

    const url = container.getAttribute("data-live-url");
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

    // Run plugin initializers
    this._plugins.forEach((plugin) => {
      if (plugin.initialize) plugin.initialize(this, container, url);
    });
  }
}

export default LiveBindCore;
