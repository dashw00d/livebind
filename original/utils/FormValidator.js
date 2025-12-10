/**
 * Form Validator Utility
 * Handles form validation errors and display
 */
class FormValidator {
  /**
   * Display validation errors inline under each field
   * @param {HTMLFormElement} form - The form element
   * @param {Object} errors - Object with field names as keys and error arrays as values
   */
  static displayErrors(form, errors) {
    this.clearErrors(form);

    // Add errors to each field
    for (const [fieldName, messages] of Object.entries(errors)) {
      const field = form.querySelector(
        `[name="${fieldName}"], [name="${fieldName}[]"]`
      );
      if (field) {
        // Add error styling to field (red border)
        field.classList.add("border-red-500", "ring-1", "ring-red-500");

        // Create error message element (red text)
        const errorDiv = document.createElement("div");
        errorDiv.className = "text-red-500 text-sm mt-1 validation-error";
        errorDiv.innerHTML = messages.join("<br>");

        // Insert after field (or after its parent if wrapped)
        const container = field.closest(".form-control") || field.parentElement;
        container.appendChild(errorDiv);

        // Clear error on input change
        field.addEventListener("input", () => this.clearFieldError(field), {
          once: true,
        });
      }
    }

    // Scroll to first error
    const firstError = form.querySelector(".border-red-500");
    if (firstError) {
      firstError.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      firstError.focus();
    }
  }

  /**
   * Clear all validation errors from form
   * @param {HTMLFormElement} form - The form element
   */
  static clearErrors(form) {
    form.querySelectorAll(".validation-error").forEach((el) => el.remove());
    form.querySelectorAll(".border-red-500").forEach((el) => {
      el.classList.remove("border-red-500", "ring-1", "ring-red-500");
    });
  }

  /**
   * Clear error from single field
   * @param {HTMLElement} field - The form field element
   */
  static clearFieldError(field) {
    field.classList.remove("border-red-500", "ring-1", "ring-red-500");
    const container = field.closest(".form-control") || field.parentElement;
    container
      .querySelectorAll(".validation-error")
      .forEach((el) => el.remove());
  }

  /**
   * Handle Unpoly validation error responses
   * Uses up:request:loaded which fires BEFORE Unpoly tries to parse the response
   * @param {Object} event - Unpoly request loaded event
   */
  static handleValidationResponse(event) {
    const response = event.response;

    // Check for validation error (422 status with JSON content-type)
    if (
      response.status === 422 &&
      response.contentType.includes("application/json")
    ) {
      // Prevent Unpoly from trying to render the JSON as HTML
      event.preventDefault();

      try {
        const data = JSON.parse(response.text);
        if (data.type === "validation_error" && data.errors) {
          // Find the form from the request origin
          const origin = event.request.origin;
          let form = origin;
          if (form && form.tagName !== "FORM") {
            form = form.closest("form");
          }
          // Fallback: find form by request URL if origin doesn't work
          if (!form) {
            const url = new URL(response.url);
            form =
              document.querySelector(`form[action*="${url.pathname}"]`) ||
              document.querySelector("form");
          }

          if (form) {
            FormValidator.displayErrors(form, data.errors);
          } else {
            console.error("Could not find form to display validation errors");
            // Fallback: show alert with errors
            const errorList = Object.values(data.errors).flat().join("\n");
            alert("Validation errors:\n" + errorList);
          }
        }
      } catch (e) {
        console.error("Failed to parse validation response:", e);
      }
    }
  }
}

export default FormValidator;
