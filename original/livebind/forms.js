/**
 * LiveBind Forms Plugin
 * Handles: data-live-input, data-live-model, debounce, throttle, dirty tracking,
 * validation errors, min-length, show-on-focus
 */

const FormsPlugin = {
  name: "forms",

  initGlobal(LiveBind) {
    // Auto-compiler for forms
    if (!LiveBind._autoCompilerInitialized) {
      LiveBind._autoCompilerInitialized = true;

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== 1) return;

            if (node.matches?.("[data-live-form]")) {
              LiveBind.initialize(node);
            }

            node.querySelectorAll?.("[data-live-form]").forEach((form) => {
              LiveBind.initialize(form);
            });
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }
  },

  initialize(LiveBind, container, url) {
    const isDeferred = container.hasAttribute("data-live-defer");

    // Dirty tracking
    this.setupDirtyTracking(LiveBind, container);

    // Input handlers
    const delay = parseInt(container.getAttribute("data-live-delay") || "300", 10);
    const throttleMs = parseInt(container.getAttribute("data-live-throttle"), 10);
    const inputs = container.querySelectorAll("[data-live-input], [data-live-model]");

    inputs.forEach((input) => {
      const updateFn = () => this.performUpdate(LiveBind, container, url, input);
      const limitedUpdate = throttleMs
        ? LiveBind.throttle(updateFn, throttleMs)
        : LiveBind.debounce(updateFn, delay);

      const eventType =
        input.tagName === "SELECT" || input.type === "checkbox" || input.type === "radio"
          ? "change"
          : "input";

      input.addEventListener(eventType, (e) => {
        if (isDeferred) return;
        if (!this.meetsMinLength(input)) return;

        const showOnFocusTarget = input.getAttribute("data-live-show-on-focus");
        if (showOnFocusTarget) {
          const target = container.querySelector(`[data-live-target="${showOnFocusTarget}"]`);
          if (target) target.style.display = "";
        }

        limitedUpdate();
      });

      // Show on focus
      const showOnFocusTarget = input.getAttribute("data-live-show-on-focus");
      if (showOnFocusTarget) {
        input.addEventListener("focus", () => {
          const target = container.querySelector(`[data-live-target="${showOnFocusTarget}"]`);
          if (target && input.value.length >= (parseInt(input.getAttribute("data-live-min-length"), 10) || 0)) {
            target.style.display = "";
          }
        });
      }
    });

    // Submit button for defer mode
    container.querySelectorAll("[data-live-submit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.performUpdate(LiveBind, container, url, null);
      });
    });

    // Initial states for targets
    const initialStates = new Map();
    container.querySelectorAll("[data-live-target]").forEach((target) => {
      const key = target.getAttribute("data-live-target");
      initialStates.set(key, { innerHTML: target.innerHTML, display: target.style.display });

      if (target.hasAttribute("data-live-dropdown")) {
        this.setupDropdown(LiveBind, container, target);
      }
    });
    container._liveBindInitialStates = initialStates;
  },

  // ==================== PERFORM UPDATE ====================

  async performUpdate(LiveBind, container, url, triggerInput = null) {
    if (!LiveBind.isOnline) {
      console.warn("LiveBind: Offline, skipping update");
      return;
    }

    if (triggerInput && !this.meetsMinLength(triggerInput)) return;

    this.clearErrors(container);
    LiveBind.emit(container, "beforeUpdate", { container, triggerInput });
    LiveBind.setLoading(container, true);

    try {
      const form = container.tagName === "FORM" ? container : container.querySelector("form");
      const formData = form ? new FormData(form) : new FormData();
      const params = {};
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) continue;
        params[key] = value;
      }

      const response = await LiveBind.request({ url, method: "POST", params });

      if (response.status === 422) {
        try {
          const data = JSON.parse(response.text);
          if (data.errors) {
            this.displayErrors(container, data.errors);
          }
        } catch (e) {
          console.error("LiveBind: Invalid JSON in 422 response");
        }
        LiveBind.emit(container, "error", { status: 422 });
        return;
      }

      const contentType = response.contentType;

      if (contentType.includes("application/json")) {
        const data = JSON.parse(response.text);
        LiveBind.updateOutputs(data, container);
      } else {
        const parser = new DOMParser();
        const doc = parser.parseFromString(response.text, "text/html");

        container.querySelectorAll("[data-live-target]").forEach((target) => {
          const key = target.getAttribute("data-live-target");
          const transitionName = target.getAttribute("data-live-transition");
          const responseEl = doc.querySelector(`[data-live-target="${key}"]`) || doc.querySelector(`#${key}`);

          if (responseEl) {
            if (transitionName) {
              target.classList.add(`${transitionName}-leave`);
              requestAnimationFrame(() => {
                LiveBind.morph(target, responseEl.innerHTML);
                target.classList.remove(`${transitionName}-leave`);
                target.classList.add(`${transitionName}-enter`);
                requestAnimationFrame(() => {
                  target.classList.remove(`${transitionName}-enter`);
                });
              });
            } else {
              LiveBind.morph(target, responseEl.innerHTML);
            }
            target.style.display = "";
          }
        });
      }

      LiveBind.emit(container, "afterUpdate", { container, response });
    } catch (error) {
      console.error("LiveBind: Update failed", error);
      LiveBind.emit(container, "error", { error });
    } finally {
      LiveBind.setLoading(container, false);
    }
  },

  // ==================== VALIDATION ERRORS ====================

  displayErrors(container, errors) {
    container.querySelectorAll("[data-live-error]").forEach((el) => {
      el.textContent = "";
      el.hidden = true;
      el.style.display = "none";
    });

    container.querySelectorAll(".live-invalid").forEach((el) => {
      el.classList.remove("live-invalid");
    });

    Object.entries(errors).forEach(([field, messages]) => {
      const errorEl = container.querySelector(`[data-live-error="${field}"]`);
      if (errorEl) {
        errorEl.textContent = Array.isArray(messages) ? messages[0] : messages;
        errorEl.hidden = false;
        errorEl.style.display = "";
      }

      const input = container.querySelector(`[name="${field}"]`);
      if (input) {
        input.classList.add("live-invalid");
      }
    });
  },

  clearErrors(container) {
    container.querySelectorAll("[data-live-error]").forEach((el) => {
      el.textContent = "";
      el.hidden = true;
      el.style.display = "none";
    });
    container.querySelectorAll(".live-invalid").forEach((el) => {
      el.classList.remove("live-invalid");
    });
  },

  // ==================== DIRTY TRACKING ====================

  setupDirtyTracking(LiveBind, container) {
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
        const currentValue = input.type === "checkbox" || input.type === "radio" ? input.checked : input.value;
        if (currentValue !== initialValue) isDirty = true;
      });

      if (isDirty !== container._liveBindIsDirty) {
        container._liveBindIsDirty = isDirty;

        container.querySelectorAll("[data-live-dirty]").forEach((el) => {
          el.hidden = !isDirty;
          el.style.display = isDirty ? "" : "none";
        });

        container.querySelectorAll("[data-live-pristine]").forEach((el) => {
          if (el.tagName === "BUTTON" || el.tagName === "INPUT") {
            el.disabled = isDirty;
          } else {
            el.hidden = isDirty;
            el.style.display = isDirty ? "none" : "";
          }
        });

        LiveBind.emit(container, isDirty ? "dirty" : "pristine", {});
      }
    };

    inputs.forEach((input) => {
      input.addEventListener("input", checkDirty);
      input.addEventListener("change", checkDirty);
    });
  },

  // ==================== UTILITIES ====================

  meetsMinLength(input) {
    const minLength = parseInt(input.getAttribute("data-live-min-length"), 10);
    if (isNaN(minLength)) return true;
    return input.value.length >= minLength;
  },

  setupDropdown(_LiveBind, container, target) {
    let activeIndex = -1;

    container.addEventListener("keydown", (e) => {
      if (target.style.display === "none") return;

      const items = target.querySelectorAll("[data-live-action], button, a");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        items.forEach((item, i) => item.classList.toggle("active", i === activeIndex));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        items.forEach((item, i) => item.classList.toggle("active", i === activeIndex));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        items[activeIndex].click();
      } else if (e.key === "Escape") {
        target.style.display = "none";
        activeIndex = -1;
      }
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        target.style.display = "none";
        activeIndex = -1;
      }
    });
  },
};

export default FormsPlugin;
