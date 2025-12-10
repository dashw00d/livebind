/**
 * Toast Utility
 * Handles toast dismissal and management
 */
class Toast {
  /**
   * Dismiss a toast by ID
   * @param {string} toastId - The ID of the toast to dismiss
   */
  static dismiss(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) {
      toast.classList.add("translate-x-full", "opacity-0");
      setTimeout(() => {
        toast.remove();
      }, 300);
    }
  }

  /**
   * Initialize toast dismissal event handlers
   */
  static initializeDismissHandlers() {
    document.addEventListener("click", (e) => {
      const dismissBtn =
        e.target.matches('[data-action="dismiss-toast"]') ||
        e.target.closest('[data-action="dismiss-toast"]');

      if (dismissBtn) {
        const button = e.target.matches('[data-action="dismiss-toast"]')
          ? e.target
          : e.target.closest('[data-action="dismiss-toast"]');
        const targetId = button.getAttribute("data-target");
        if (targetId) {
          this.dismiss(targetId);
        }
      }
    });
  }
}

export default Toast;
