/**
 * Time Picker Utility
 * Handles time picker dropdown functionality
 */
class TimePicker {
  /**
   * Filter time options based on search query
   * @param {NodeList} options - The option elements
   * @param {string} query - The search query
   */
  static filterOptions(options, query) {
    let hasVisible = false;
    options.forEach((opt) => {
      const label = opt.dataset.label.toLowerCase();
      const show = !query || label.indexOf(query) !== -1;
      opt.style.display = show ? "" : "none";
      if (show) hasVisible = true;
    });
    return hasVisible;
  }

  /**
   * Scroll to the currently selected option
   * @param {HTMLElement} dropdown - The dropdown container
   * @param {string} hiddenValue - The current selected value
   */
  static scrollToSelected(dropdown, hiddenValue) {
    const selected = dropdown.querySelector(`[data-value="${hiddenValue}"]`);
    if (selected) {
      selected.scrollIntoView({
        block: "center",
      });
    }
  }

  /**
   * Update the selected state styling
   * @param {NodeList} options - The option elements
   * @param {string} value - The selected value
   */
  static updateSelected(options, value) {
    options.forEach((opt) => {
      if (opt.dataset.value === value) {
        opt.classList.add(
          "bg-admin-purple/10",
          "text-admin-purple",
          "font-medium"
        );
        opt.classList.remove("text-gray-700");
      } else {
        opt.classList.remove(
          "bg-admin-purple/10",
          "text-admin-purple",
          "font-medium"
        );
        opt.classList.add("text-gray-700");
      }
    });
  }

  /**
   * Initialize a time picker component
   * @param {HTMLElement} wrap - The time picker wrapper element
   */
  static initialize(wrap) {
    const input = wrap.querySelector("[data-timepicker-input]");
    const hidden = wrap.querySelector('input[type="hidden"]');
    const dropdown = wrap.querySelector("[data-timepicker-dropdown]");
    const options = dropdown.querySelectorAll("[data-value]");

    // Show dropdown on focus
    input.addEventListener("focus", () => {
      dropdown.classList.remove("hidden");
      this.filterOptions(options, "");
      this.scrollToSelected(dropdown, hidden.value);
    });

    // Filter on input
    input.addEventListener("input", () => {
      const query = input.value.toLowerCase();
      this.filterOptions(options, query);
      dropdown.classList.remove("hidden");
    });

    // Hide dropdown on blur (with delay for click)
    input.addEventListener("blur", () => {
      setTimeout(() => {
        dropdown.classList.add("hidden");
      }, 150);
    });

    // Option click
    options.forEach((opt) => {
      opt.addEventListener("mousedown", (e) => {
        e.preventDefault();
        hidden.value = opt.dataset.value;
        input.value = opt.dataset.label;
        dropdown.classList.add("hidden");
        this.updateSelected(options, opt.dataset.value);
      });
    });
  }
}

export default TimePicker;
