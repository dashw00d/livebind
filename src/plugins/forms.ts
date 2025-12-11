/**
 * LiveBind Forms Plugin
 * Handles: data-live-input, data-live-model, debounce, throttle, dirty tracking,
 * validation errors, min-length, show-on-focus
 */

import type { LiveBindPlugin, LiveBindContainer, TargetInitialState, RequestResponse, LiveBindStatic } from '../types';

type InputElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const FormsPlugin: LiveBindPlugin = {
    name: 'forms',

    initGlobal(LiveBind: LiveBindStatic): void {
        // Auto-compiler for forms
        if (!(LiveBind as unknown as { _autoCompilerInitialized?: boolean })._autoCompilerInitialized) {
            (LiveBind as unknown as { _autoCompilerInitialized: boolean })._autoCompilerInitialized = true;

            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            const el = node as HTMLElement;
                            // Check for removed polling containers
                            if (el.matches?.('[data-live-form][data-live-poll]')) {
                                (el as LiveBindContainer)._liveBindStopPolling?.();
                            }
                            // Check nested
                            el.querySelectorAll?.<LiveBindContainer>('[data-live-form][data-live-poll]').forEach((c) => {
                                c._liveBindStopPolling?.();
                            });
                        }
                    });

                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType !== 1) return;

                        const element = node as Element;
                        if (element.matches?.('[data-live-form]')) {
                            LiveBind.initialize(element as LiveBindContainer);
                        }

                        element.querySelectorAll?.('[data-live-form]').forEach((form) => {
                            LiveBind.initialize(form as LiveBindContainer);
                        });
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });

            (LiveBind as unknown as { _observer: MutationObserver })._observer = observer;

            // Global dropdown click listener
            document.addEventListener('click', (e) => {
                const target = e.target as Element;
                document.querySelectorAll<HTMLElement>('[data-live-dropdown]').forEach((dd) => {
                    const container = dd.closest('[data-live-form]');
                    if (container && !container.contains(target)) {
                        dd.style.display = 'none';
                    }
                });
            });
        }
    },

    initialize(LiveBind: LiveBindStatic, container: LiveBindContainer, url: string): void {
        const isDeferred = container.hasAttribute('data-live-defer');

        // Dirty tracking
        setupDirtyTracking(LiveBind, container);

        // Input handlers
        const delay = parseInt(container.getAttribute('data-live-delay') || '300', 10);
        const throttleMs = parseInt(container.getAttribute('data-live-throttle') || '0', 10);
        const inputs = container.querySelectorAll<InputElement>('[data-live-input], [data-live-model]');

        inputs.forEach((input) => {
            if (input.closest('[data-live-ignore]')) return;

            const updateFn = () => performUpdate(LiveBind, container, url, input);
            const limitedUpdate = throttleMs
                ? LiveBind.throttle(updateFn, throttleMs)
                : LiveBind.debounce(updateFn, delay);

            const eventType =
                input.tagName === 'SELECT' || input.type === 'checkbox' || input.type === 'radio'
                    ? 'change'
                    : 'input';

            input.addEventListener(eventType, () => {
                if (isDeferred) return;
                if (!meetsMinLength(input)) return;

                const showOnFocusTarget = input.getAttribute('data-live-show-on-focus');
                if (showOnFocusTarget) {
                    const target = container.querySelector<HTMLElement>(`[data-live-target="${showOnFocusTarget}"]`);
                    if (target) target.style.display = '';
                }

                limitedUpdate();
            });

            // Show on focus
            const showOnFocusTarget = input.getAttribute('data-live-show-on-focus');
            if (showOnFocusTarget) {
                input.addEventListener('focus', () => {
                    const target = container.querySelector<HTMLElement>(`[data-live-target="${showOnFocusTarget}"]`);
                    if (target && input.value.length >= (parseInt(input.getAttribute('data-live-min-length') || '0', 10))) {
                        target.style.display = '';
                    }
                });
            }
        });

        // Submit button for defer mode
        container.querySelectorAll<HTMLElement>('[data-live-submit]').forEach((btn) => {
            btn.addEventListener('click', () => {
                performUpdate(LiveBind, container, url, null);
            });
        });

        // Intercept form submissions
        if (container.tagName === 'FORM') {
            container.addEventListener('submit', (e) => {
                const submitter = (e as SubmitEvent).submitter as HTMLElement | null;

                // Allow native if the form container or submit button is explicitly marked native
                if (container.matches('[data-live-native]') || submitter?.closest('[data-live-native]')) {
                    return;
                }

                e.preventDefault();
                performUpdate(LiveBind, container, url, null);
            });
        } else {
            container.addEventListener('submit', (e) => {
                const target = e.target as HTMLElement;
                const submitter = (e as SubmitEvent).submitter as HTMLElement | null;

                if (target.closest('[data-live-ignore]')) return;

                // Allow native submission if explicitly marked on the form or the submit button
                if (target.closest('[data-live-native]') || submitter?.closest('[data-live-native]')) {
                    return;
                }

                e.preventDefault();
                performUpdate(LiveBind, container, url, null);
            });
        }

        // Initial states for targets
        const initialStates = new Map<string, TargetInitialState>();
        container.querySelectorAll<HTMLElement>('[data-live-target]').forEach((target) => {
            const key = target.getAttribute('data-live-target')!;
            initialStates.set(key, { innerHTML: target.innerHTML, display: target.style.display });

            if (target.hasAttribute('data-live-dropdown')) {
                setupDropdown(container);
            }
        });
        container._liveBindInitialStates = initialStates;
    },
};

// ==================== PERFORM UPDATE ====================

async function performUpdate(
    LiveBind: LiveBindStatic,
    container: LiveBindContainer,
    url: string,
    triggerInput: InputElement | null = null
): Promise<void> {
    if (!LiveBind.isOnline) {
        console.warn('LiveBind: Offline, skipping update');
        return;
    }

    if (triggerInput && !meetsMinLength(triggerInput)) return;

    clearErrors(container);
    LiveBind.emit(container, 'beforeUpdate', { container, triggerInput });
    LiveBind.setLoading(container, true);

    try {
        const form = container.tagName === 'FORM' ? container as HTMLFormElement : container.querySelector<HTMLFormElement>('form');
        let params: Record<string, string> = {};

        if (form) {
            const formData = new FormData(form);
            for (const [key, value] of formData.entries()) {
                if (value instanceof File) continue;
                params[key] = value as string;
            }
        } else {
            // Collect inputs within the container when no form element is present
            container.querySelectorAll<InputElement>('input, textarea, select, [data-live-model]').forEach((el) => {
                if (el.closest('[data-live-ignore]')) return;
                const name = el.getAttribute('name') || el.getAttribute('data-live-model');

                // Skip inputs without a name/model OR if it's a [data-live-model] on a non-input element that doesn't hold value
                if (!name) return;
                if (!('value' in el) && !(el as HTMLElement).hasAttribute('data-live-model')) return;

                if (el.type === 'checkbox') {
                    if ((el as HTMLInputElement).checked) {
                        params[name] = el.value ?? 'on';
                    } else if (!(name in params)) {
                        params[name] = '';
                    }
                } else if (el.type === 'radio') {
                    if ((el as HTMLInputElement).checked) params[name] = el.value;
                } else {
                    params[name] = el.value ?? '';
                }
            });
        }

        const response: RequestResponse = await LiveBind.request({ url, method: 'POST', params });

        if (response.status === 422) {
            try {
                const data = JSON.parse(response.text) as { errors?: Record<string, string | string[]> };
                if (data.errors) {
                    displayErrors(container, data.errors);
                }
            } catch {
                console.error('LiveBind: Invalid JSON in 422 response');
            }
            LiveBind.emit(container, 'error', { status: 422 });
            return;
        }

        const contentType = response.contentType;

        if (contentType.includes('application/json')) {
            const data = JSON.parse(response.text) as Record<string, unknown>;
            LiveBind.updateOutputs(data, container);
        } else {
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.text, 'text/html');

            let scope: Element | Document = document;
            const scopeAttr = container.getAttribute('data-live-scope');
            if (scopeAttr === 'container' || container.hasAttribute('data-live-scoped')) {
                scope = container;
            } else if (scopeAttr && scopeAttr !== 'document') {
                const found = document.querySelector(scopeAttr);
                if (found) scope = found;
            }

            scope.querySelectorAll<HTMLElement>('[data-live-target]').forEach((target) => {
                if (target.closest('[data-live-ignore]')) return;

                const key = target.getAttribute('data-live-target')!;
                const transitionName = target.getAttribute('data-live-transition');
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
                    target.style.display = '';
                }
            });
        }

        LiveBind.emit(container, 'afterUpdate', { container, response });
    } catch (error) {
        console.error('LiveBind: Update failed', error);
        LiveBind.emit(container, 'error', { error });
    } finally {
        LiveBind.setLoading(container, false);
    }
}

// ==================== VALIDATION ERRORS ====================

function displayErrors(container: LiveBindContainer, errors: Record<string, string | string[]>): void {
    container.querySelectorAll<HTMLElement>('[data-live-error]').forEach((el) => {
        el.textContent = '';
        el.hidden = true;
        el.style.display = 'none';
    });

    container.querySelectorAll<HTMLElement>('.live-invalid').forEach((el) => {
        el.classList.remove('live-invalid');
    });

    Object.entries(errors).forEach(([field, messages]) => {
        const errorEl = container.querySelector<HTMLElement>(`[data-live-error="${field}"]`);
        if (errorEl) {
            errorEl.textContent = Array.isArray(messages) ? messages[0] : messages;
            errorEl.hidden = false;
            errorEl.style.display = '';
        }

        const input = container.querySelector<HTMLElement>(`[name="${field}"]`);
        if (input) {
            input.classList.add('live-invalid');
        }
    });
}

function clearErrors(container: LiveBindContainer): void {
    container.querySelectorAll<HTMLElement>('[data-live-error]').forEach((el) => {
        el.textContent = '';
        el.hidden = true;
        el.style.display = 'none';
    });
    container.querySelectorAll<HTMLElement>('.live-invalid').forEach((el) => {
        el.classList.remove('live-invalid');
    });
}

// ==================== DIRTY TRACKING ====================

function setupDirtyTracking(LiveBind: LiveBindStatic, container: LiveBindContainer): void {
    const inputs = container.querySelectorAll<InputElement>('input, textarea, select, [data-live-model]');
    const initialValues = new Map<InputElement, string | boolean>();

    inputs.forEach((input) => {
        if (input.type === 'checkbox' || input.type === 'radio') {
            initialValues.set(input, (input as HTMLInputElement).checked);
        } else {
            initialValues.set(input, input.value);
        }
    });

    container._liveBindInitialValues = initialValues as Map<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, string | boolean>;
    container._liveBindIsDirty = false;

    const checkDirty = (): void => {
        let isDirty = false;
        initialValues.forEach((initialValue, input) => {
            const currentValue = input.type === 'checkbox' || input.type === 'radio'
                ? (input as HTMLInputElement).checked
                : input.value;
            if (currentValue !== initialValue) isDirty = true;
        });

        if (isDirty !== container._liveBindIsDirty) {
            container._liveBindIsDirty = isDirty;

            container.querySelectorAll<HTMLElement>('[data-live-dirty]').forEach((el) => {
                el.hidden = !isDirty;
                el.style.display = isDirty ? '' : 'none';
            });

            container.querySelectorAll<HTMLElement>('[data-live-pristine]').forEach((el) => {
                if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
                    (el as HTMLButtonElement | HTMLInputElement).disabled = isDirty;
                } else {
                    el.hidden = isDirty;
                    el.style.display = isDirty ? 'none' : '';
                }
            });

            LiveBind.emit(container, isDirty ? 'dirty' : 'pristine', {});
        }
    };

    inputs.forEach((input) => {
        input.addEventListener('input', checkDirty);
        input.addEventListener('change', checkDirty);
    });
}

// ==================== UTILITIES ====================

function meetsMinLength(input: InputElement): boolean {
    const minLength = parseInt(input.getAttribute('data-live-min-length') || '', 10);
    if (isNaN(minLength)) return true;
    return input.value.length >= minLength;
}

function setupDropdown(container: LiveBindContainer): void {
    if (container._liveBindDropdownInitialized) return;
    container._liveBindDropdownInitialized = true;

    let activeIndex = -1;

    container.addEventListener('keydown', (e: KeyboardEvent) => {
        // Only run if a dropdown inside this container is visible
        const visibleDropdown = container.querySelector<HTMLElement>('[data-live-dropdown]:not([style*="display: none"])');
        if (!visibleDropdown) return;

        // ... (existing logic, but using visibleDropdown)
        const items = visibleDropdown.querySelectorAll<HTMLElement>('[data-live-action], button, a');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            items[activeIndex].click();
        } else if (e.key === 'Escape') {
            visibleDropdown.style.display = 'none';
            activeIndex = -1;
        }
    });
}

// Export helper for actions plugin
export { displayErrors, clearErrors };
export default FormsPlugin;
export { FormsPlugin };
