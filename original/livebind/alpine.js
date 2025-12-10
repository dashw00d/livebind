/**
 * LiveBind Alpine Plugin
 * Handles: data-live-entangle - two-way binding with Alpine.js
 */

const AlpinePlugin = {
  name: "alpine",

  onUpdateOutputs(_LiveBind, data, container) {
    if (!window.Alpine || !container) return;

    // Find elements with data-live-entangle and sync Alpine data
    container.querySelectorAll("[data-live-entangle]").forEach((el) => {
      const key = el.getAttribute("data-live-entangle");
      if (!(key in data)) return;

      const alpineData = Alpine.$data(el);
      if (!alpineData) return;

      if (key in alpineData) {
        alpineData[key] = data[key];
      }
    });

    // Check container itself
    if (container.hasAttribute("data-live-entangle")) {
      const key = container.getAttribute("data-live-entangle");
      if (key in data) {
        const alpineData = Alpine.$data(container);
        if (alpineData && key in alpineData) {
          alpineData[key] = data[key];
        }
      }
    }
  },

  initialize(_LiveBind, container, _url) {
    if (!window.Alpine) return;

    // Setup watchers: Alpine -> LiveBind (sync to hidden inputs)
    container.querySelectorAll("[data-live-entangle]").forEach((el) => {
      const key = el.getAttribute("data-live-entangle");
      const alpineData = Alpine.$data(el);
      if (!alpineData || !(key in alpineData)) return;

      Alpine.effect(() => {
        const value = alpineData[key];

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
  },
};

export default AlpinePlugin;
