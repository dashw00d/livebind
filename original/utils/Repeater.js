/**
 * Repeater Component Utility
 * Handles dynamic add/remove functionality for repeatable form elements
 */
class Repeater {
  /**
   * Update empty state visibility
   * @param {HTMLElement} list - The list container
   * @param {HTMLElement} empty - The empty state element
   */
  static updateEmptyState(list, empty) {
    const itemCount = list.querySelectorAll("[data-item]").length;
    empty.style.display = itemCount ? "none" : "block";
  }

  /**
   * Create a new item from template
   * @param {HTMLTemplateElement} template - The template element
   * @param {number} index - The index for the new item
   * @returns {HTMLElement} The cloned element
   */
  static createItem(template, index) {
    const clone = template.content.cloneNode(true);
    const clonedElement = clone.firstElementChild;

    if (!clonedElement) {
      console.error("Repeater: Failed to clone template");
      return null;
    }

    // Replace __INDEX__ placeholder with actual index
    clonedElement
      .querySelectorAll("input, textarea, select")
      .forEach((input) => {
        if (input.name) {
          input.name = input.name.replace(/__INDEX__/g, index);
        }
      });

    return clonedElement;
  }

  /**
   * Remove an item and update empty state
   * @param {HTMLElement} item - The item to remove
   * @param {HTMLElement} list - The list container
   * @param {HTMLElement} empty - The empty state element
   */
  static removeItem(item, list, empty) {
    item.remove();
    this.updateEmptyState(list, empty);
  }

  /**
   * Initialize a repeater component
   * @param {HTMLElement} container - The repeater container
   */
  static initialize(container) {
    const repeaterId = container.getAttribute("data-repeater");
    console.log("Repeater: Initializing", repeaterId);

    const list = container.querySelector("[data-list]");
    const template = container.querySelector("[data-template]");
    const empty = container.querySelector("[data-empty]");
    const addBtn = container.querySelector('[data-action="add"]');

    if (!list || !template || !empty || !addBtn) {
      console.error("Repeater: Missing required elements", {
        list,
        template,
        empty,
        addBtn,
        container,
      });
      return;
    }

    // Add button click handler
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Repeater: Add clicked for", repeaterId);

      const existingItems = list.querySelectorAll("[data-item]");
      const nextIndex = existingItems.length;

      const newItem = this.createItem(template, nextIndex);
      if (newItem) {
        list.appendChild(newItem);

        // Let Unpoly compile any nested components
        up.hello(list.lastElementChild);

        this.updateEmptyState(list, empty);
      }
    });

    // Delegated remove handler
    list.addEventListener("click", (e) => {
      if (e.target.matches('[data-action="remove"]')) {
        e.preventDefault();
        console.log("Repeater: Remove clicked for", repeaterId);
        const item = e.target.closest("[data-item]");
        if (item) {
          this.removeItem(item, list, empty);
        }
      }
    });

    this.updateEmptyState(list, empty);
    console.log("Repeater: Ready", repeaterId);
  }
}

export default Repeater;

