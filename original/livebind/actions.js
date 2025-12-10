/**
 * LiveBind Actions Plugin
 * Handles: data-live-action, data-live-confirm, data-live-optimistic,
 * data-live-batch, data-live-clear, file uploads
 */

const ActionsPlugin = {
  name: "actions",

  initialize(LiveBind, container, url) {
    // Action delegation
    container.addEventListener("click", async (e) => {
      // Clear action
      if (e.target.closest("[data-live-clear]")) {
        e.preventDefault();
        const initialStates = container._liveBindInitialStates;
        if (initialStates) {
          initialStates.forEach((initial, key) => {
            const target = container.querySelector(`[data-live-target="${key}"]`);
            if (target) {
              target.innerHTML = initial.innerHTML;
              target.style.display = initial.display;
            }
          });
        }
        container.querySelectorAll("[data-live-input]").forEach((input) => (input.value = ""));
        return;
      }

      // Action button
      const actionEl = e.target.closest("[data-live-action]");
      if (!actionEl) return;

      e.preventDefault();
      e.stopPropagation();

      // Confirmation
      const confirmMsg = actionEl.getAttribute("data-live-confirm");
      if (confirmMsg && !window.confirm(confirmMsg)) return;

      const actionUrl = actionEl.getAttribute("data-live-action");
      const actionMethod = actionEl.getAttribute("data-live-method") || "POST";
      const shouldNavigate = actionEl.hasAttribute("data-live-navigate");
      const optimisticSpec = actionEl.getAttribute("data-live-optimistic");
      const batchActionName = actionEl.getAttribute("data-live-batch-action");

      const actionParams = {};

      // Collect form data
      const form = container.tagName === "FORM" ? container : container.querySelector("form");
      if (form) {
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
          if (!(value instanceof File)) {
            actionParams[key] = value;
          }
        }
      }

      // Collect data-live-param-*
      for (const attr of actionEl.attributes) {
        if (attr.name.startsWith("data-live-param-")) {
          actionParams[attr.name.replace("data-live-param-", "")] = attr.value;
        }
      }

      // Collect batch values
      if (batchActionName) {
        actionParams[batchActionName] = this.collectBatchValues(container, batchActionName);
      }

      // Optimistic update
      let rollback = () => {};
      if (optimisticSpec) {
        rollback = this.applyOptimistic(container, optimisticSpec);
      }

      LiveBind.emit(container, "action", { actionEl, actionParams });
      LiveBind.setLoading(container, true);

      try {
        const response = await LiveBind.request({
          url: actionUrl,
          method: actionMethod,
          params: actionParams,
        });

        // Handle validation errors
        if (response.status === 422) {
          try {
            const data = JSON.parse(response.text);
            if (data.errors) {
              const formsPlugin = LiveBind.getPlugin("forms");
              if (formsPlugin) formsPlugin.displayErrors(container, data.errors);
            }
          } catch (e) {}
          rollback();
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
            const responseEl = doc.querySelector(`[data-live-target="${key}"]`) || doc.querySelector(`#${key}`);
            if (responseEl) {
              LiveBind.morph(target, responseEl.innerHTML);
            }
          });
        }

        LiveBind.emit(container, "actionComplete", { actionEl, response });

        if (shouldNavigate) {
          window.history.pushState({}, "", actionUrl);
        }

        // Close dropdowns
        container.querySelectorAll("[data-live-dropdown]").forEach((dd) => {
          dd.style.display = "none";
        });

        // Clear search input
        const searchInput = container.querySelector("[data-live-input][type='text']");
        if (searchInput) searchInput.value = "";
      } catch (error) {
        console.error("LiveBind: Action failed", error);
        rollback();
        LiveBind.emit(container, "error", { error });
      } finally {
        LiveBind.setLoading(container, false);
      }
    });

    // File uploads
    container.querySelectorAll("[data-live-upload]").forEach((input) => {
      if (input.type !== "file") return;

      input.addEventListener("change", () => {
        if (!input.files.length) return;

        const uploadUrl = input.getAttribute("data-live-upload") || url;
        const formData = new FormData();
        formData.append(input.name || "file", input.files[0]);

        const progressKey = input.getAttribute("data-live-progress");

        const xhr = new XMLHttpRequest();

        if (progressKey) {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              LiveBind.updateOutputs({ [progressKey]: percent }, container);
            }
          });
        }

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              LiveBind.updateOutputs(data, container);
            } catch (e) {}
          }
          LiveBind.emit(container, "uploadComplete", { input, xhr });
        });

        xhr.open("POST", uploadUrl);
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        if (csrfToken) xhr.setRequestHeader("X-CSRF-TOKEN", csrfToken);
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        xhr.send(formData);

        LiveBind.emit(container, "uploadStart", { input });
      });
    });
  },

  // ==================== BATCH ====================

  collectBatchValues(container, batchName) {
    const values = [];
    container.querySelectorAll(`[data-live-batch="${batchName}"]:checked`).forEach((el) => {
      values.push(el.value);
    });
    return values;
  },

  // ==================== OPTIMISTIC ====================

  applyOptimistic(container, spec) {
    const rollbacks = [];

    spec.split(",").forEach((part) => {
      const [key, delta] = part.split(":").map((s) => s.trim());
      if (!key || !delta) return;

      container.querySelectorAll(`[data-live-output="${key}"]`).forEach((el) => {
        const originalValue = el.textContent;
        rollbacks.push(() => (el.textContent = originalValue));

        const currentNum = parseFloat(originalValue) || 0;
        if (delta.startsWith("+")) {
          el.textContent = currentNum + parseFloat(delta.slice(1));
        } else if (delta.startsWith("-")) {
          el.textContent = currentNum - parseFloat(delta.slice(1));
        } else {
          el.textContent = delta;
        }
      });
    });

    return () => rollbacks.forEach((rb) => rb());
  },
};

export default ActionsPlugin;
