/**
 * Admin Application Bundle
 * Combines Unpoly and all utility modules into a single bundle
 */

import "./unpoly.js";

// Import idiomorph for DOM morphing (LiveBind uses this for better updates)
import { Idiomorph } from "idiomorph";
window.Idiomorph = Idiomorph;

// Import and initialize Alpine.js
import Alpine from "alpinejs";
window.Alpine = Alpine;
Alpine.start();

// Import utility modules
import BulkSelector from "./utils/BulkSelector.js";
import FormValidator from "./utils/FormValidator.js";
import LiveBind from "./livebind/index.js"; // Modular LiveBind with all plugins
import Repeater from "./utils/Repeater.js";
import TimePicker from "./utils/TimePicker.js";
import Toast from "./utils/Toast.js";

// Export utilities to window for global access (legacy / inline use)
window.FormValidator = FormValidator;
window.Repeater = Repeater;
window.BulkSelector = BulkSelector;
window.Toast = Toast;
window.TimePicker = TimePicker;
window.LiveBind = LiveBind;

// -------------------- Unpoly config --------------------

const INTERNAL_LINK_SELECTOR = 'a[href^="/"]';

up.on("up:framework:booted", () => {
  up.network.config.autoCache = true;
  up.layer.config.modal.history = false;
  up.fragment.config.navigateOptions.history = true;
  up.fragment.config.navigateOptions.cache = "auto";
  up.fragment.config.navigateOptions.revalidate = "auto";
  up.fragment.config.navigateOptions.fallback = true;
  up.fragment.config.navigateOptions.focus = "auto";
  up.fragment.config.navigateOptions.scroll = "auto";
  up.fragment.config.navigateOptions.peel = true;

  // Turn almost all internal links into Unpoly navigations
  if (!up.link.config.followSelectors.includes(INTERNAL_LINK_SELECTOR)) {
    up.link.config.followSelectors.push(INTERNAL_LINK_SELECTOR);
  }
});

// -------------------- Request handling --------------------

up.on("up:request:loaded", (event) => {
  const response = event.response;
  if (!response) return;

  const isJson =
    typeof response.contentType === "string" &&
    response.contentType.includes("application/json");

  if (response.status === 422 && isJson) {
    event.preventDefault();

    try {
      const raw = response.text || "{}";
      const data = JSON.parse(raw);

      if (data.type === "validation_error" && data.errors) {
        const errorCount = Object.values(data.errors).flat().length;
        showValidationToast(errorCount);

        const origin = event.request && event.request.origin;
        const form =
          origin && origin.tagName !== "FORM" ? origin.closest("form") : origin;

        if (form) {
          FormValidator.displayErrors(form, data.errors);
        }
      }
    } catch (e) {
      console.error("Failed to parse validation response:", e);
    }
  }
});

// -------------------- UI helpers --------------------

function showValidationToast(errorCount) {
  const toast = document.createElement("div");
  toast.className =
    "fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3";

  toast.innerHTML =
    '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>' +
    "</svg>" +
    "<span>Please fix " +
    errorCount +
    " error" +
    (errorCount > 1 ? "s" : "") +
    "</span>" +
    '<button type="button" class="ml-2 text-white/80 hover:text-white" aria-label="Dismiss">&times;</button>';

  // Close on button click
  toast.querySelector("button")?.addEventListener("click", () => {
    toast.remove();
  });

  document.body.appendChild(toast);

  // Auto-dismiss after 5s
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 5000);
}

// -------------------- Unpoly compilers --------------------

// Character counter compiler
up.compiler("[data-countable]", (textarea) => {
  const form = textarea.closest("form");
  const counterEl = form?.querySelector("[data-count]");
  if (!counterEl) return;

  const update = () => {
    const length = textarea.value.length;
    counterEl.textContent = length;
    counterEl.classList.toggle("text-warning", length > 140);
  };

  textarea.addEventListener("input", update);
  update();
});

// Repeater component compiler
up.compiler("[data-repeater]", (el) => {
  Repeater.initialize(el);
});

// Bulk selection compilers
up.compiler("[data-select-all]", (el) => {
  BulkSelector.initializeMaster(el);
});

up.compiler("[data-bulk-actions]", (el) => {
  BulkSelector.initializeActions(el);
});

// Time Picker compiler
up.compiler("[data-timepicker-wrap]", (el) => {
  TimePicker.initialize(el);
});

// LiveBind compiler for live form updates
up.compiler("[data-live-form]", (el) => {
  LiveBind.initialize(el);
});

// -------------------- Misc --------------------

// Initialize toast dismissal handlers on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  if (Toast && typeof Toast.initializeDismissHandlers === "function") {
    Toast.initializeDismissHandlers();
  }
});
