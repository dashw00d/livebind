/**
 * Bulk Selection Utility
 * Handles master checkbox and bulk action visibility
 */
class BulkSelector {
  /**
   * Update child checkboxes based on master checkbox state
   * @param {HTMLInputElement} masterCheckbox - The master checkbox
   * @param {string} targetSelector - Selector for child checkboxes
   * @param {HTMLElement} scope - Scope element (defaults to document)
   */
  static updateChildren(masterCheckbox, targetSelector, scope = document) {
    const isChecked = masterCheckbox.checked;
    scope.querySelectorAll(targetSelector).forEach((cb) => {
      cb.checked = isChecked;
    });
    this.triggerChange(scope, targetSelector);
  }

  /**
   * Trigger change event on first child checkbox
   * @param {HTMLElement} scope - Scope element
   * @param {string} targetSelector - Selector for child checkboxes
   */
  static triggerChange(scope, targetSelector) {
    // Trigger change event on first child to notify listeners (like bulk action buttons)
    const firstChild = scope.querySelector(targetSelector);
    if (firstChild) {
      firstChild.dispatchEvent(
        new Event("change", {
          bubbles: true,
        })
      );
    }
  }

  /**
   * Update bulk action visibility based on selection count
   * @param {HTMLElement} container - The bulk actions container
   * @param {NodeList} checkboxes - The checkboxes to check
   * @param {string} countSelector - Selector for count display element
   */
  static updateVisibility(
    container,
    checkboxes,
    countSelector = "[data-selected-count]"
  ) {
    const checkedCount = Array.from(checkboxes).filter(
      (cb) => cb.checked
    ).length;
    if (checkedCount > 0) {
      container.classList.remove("hidden");
    } else {
      container.classList.add("hidden");
    }

    // Update count text if element exists
    const countEl = container.querySelector(countSelector);
    if (countEl) countEl.textContent = checkedCount;
  }

  /**
   * Initialize master checkbox functionality
   * @param {HTMLInputElement} masterCheckbox - The master checkbox element
   */
  static initializeMaster(masterCheckbox) {
    const scope = masterCheckbox.closest("form") || document;
    const targetSelector = masterCheckbox.getAttribute("data-select-all");

    masterCheckbox.addEventListener("change", () => {
      this.updateChildren(masterCheckbox, targetSelector, scope);
    });
  }

  /**
   * Initialize bulk actions container
   * @param {HTMLElement} container - The bulk actions container
   */
  static initializeActions(container) {
    const form = container.closest("form");
    if (!form) return;

    const checkboxSelector = container.getAttribute("data-checkbox-selector");
    const checkboxes = form.querySelectorAll(checkboxSelector);

    form.addEventListener("change", (e) => {
      if (
        e.target.matches(checkboxSelector) ||
        e.target.matches("[data-select-all]")
      ) {
        this.updateVisibility(container, checkboxes);
      }
    });

    // Initial check
    this.updateVisibility(container, checkboxes);
  }
}

export default BulkSelector;
