/**
 * LiveBind Actions Plugin
 * Handles: data-live-action, data-live-confirm, data-live-optimistic,
 * data-live-batch, data-live-clear, file uploads
 */

import type { LiveBindPlugin, LiveBindContainer, RequestResponse, LiveBindStatic } from '../types';

const ActionsPlugin: LiveBindPlugin = {
    name: 'actions',

    initialize(LiveBind: LiveBindStatic, container: LiveBindContainer, url: string): void {
        // Action delegation
        container.addEventListener('click', async (e: MouseEvent) => {
            const target = e.target as Element;

            if (target.closest('[data-live-ignore]')) return;

            // Clear action
            if (target.closest('[data-live-clear]')) {
                e.preventDefault();
                const initialStates = container._liveBindInitialStates;
                if (initialStates) {
                    initialStates.forEach((initial, key) => {
                        const targetEl = container.querySelector<HTMLElement>(`[data-live-target="${key}"]`);
                        if (targetEl) {
                            targetEl.innerHTML = initial.innerHTML;
                            targetEl.style.display = initial.display;
                        }
                    });
                }
                container.querySelectorAll<HTMLInputElement>('[data-live-input]').forEach((input) => (input.value = ''));
                return;
            }

            // Action button
            const actionEl = target.closest<HTMLElement>('[data-live-action]');
            if (!actionEl) return;

            e.preventDefault();
            e.stopPropagation();

            // Confirmation
            const confirmMsg = actionEl.getAttribute('data-live-confirm');
            if (confirmMsg && !window.confirm(confirmMsg)) return;

            const actionUrl = actionEl.getAttribute('data-live-action')!;
            const actionMethod = (actionEl.getAttribute('data-live-method') || 'POST') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
            const shouldNavigate = actionEl.hasAttribute('data-live-navigate');
            const optimisticSpec = actionEl.getAttribute('data-live-optimistic');
            const batchActionName = actionEl.getAttribute('data-live-batch-action');

            const actionParams: Record<string, unknown> = {};

            // Collect form data - supports both <form> and non-form containers with data-live-form
            const form = container.tagName === 'FORM' ? container as HTMLFormElement : container.querySelector<HTMLFormElement>('form');
            if (form) {
                const formData = new FormData(form);
                for (const [key, value] of formData.entries()) {
                    if (!(value instanceof File)) {
                        actionParams[key] = value;
                    }
                }
            } else {
                // For non-form containers (div[data-live-form]), manually collect named inputs
                container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[name], textarea[name], select[name]').forEach((input) => {
                    if (input.closest('[data-live-ignore]')) return;
                    // Skip batch inputs (they're handled separately) and unchecked checkboxes/radios
                    if (input.hasAttribute('data-live-batch')) return;
                    if ((input.type === 'checkbox' || input.type === 'radio') && !(input as HTMLInputElement).checked) return;
                    if (input.type === 'file') return;

                    actionParams[input.name] = input.value;
                });
            }

            // Collect data-live-param-*
            for (const attr of Array.from(actionEl.attributes)) {
                if (attr.name.startsWith('data-live-param-')) {
                    actionParams[attr.name.replace('data-live-param-', '')] = attr.value;
                }
            }

            // Collect batch values
            if (batchActionName !== null) {
                actionParams[batchActionName || 'ids'] = collectBatchValues(container, batchActionName);
            }

            // Optimistic update
            let rollback = (): void => { };
            if (optimisticSpec) {
                rollback = applyOptimistic(container, optimisticSpec);
            }

            LiveBind.emit(container, 'action', { actionEl, actionParams });
            LiveBind.setLoading(container, true);

            try {
                const response: RequestResponse = await LiveBind.request({
                    url: actionUrl,
                    method: actionMethod,
                    params: actionParams,
                });

                // Handle validation errors
                if (response.status === 422) {
                    try {
                        const data = JSON.parse(response.text) as { errors?: Record<string, string | string[]> };
                        if (data.errors) {
                            const formsPlugin = LiveBind.getPlugin('forms') as { displayErrors?: (container: LiveBindContainer, errors: Record<string, string | string[]>) => void } | undefined;
                            if (formsPlugin?.displayErrors) {
                                formsPlugin.displayErrors(container, data.errors);
                            }
                        }
                    } catch {
                        // Ignore parse errors
                    }
                    rollback();
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

                    scope.querySelectorAll<HTMLElement>('[data-live-target]').forEach((targetEl) => {
                        if (targetEl.closest('[data-live-ignore]')) return;

                        const key = targetEl.getAttribute('data-live-target')!;
                        const responseEl = doc.querySelector(`[data-live-target="${key}"]`) || doc.querySelector(`#${key}`);
                        if (responseEl) {
                            LiveBind.morph(targetEl, responseEl.innerHTML);
                        }
                    });
                }

                LiveBind.emit(container, 'actionComplete', { actionEl, response });

                if (shouldNavigate) {
                    window.history.pushState({}, '', actionUrl);
                }

                // Close dropdowns
                container.querySelectorAll<HTMLElement>('[data-live-dropdown]').forEach((dd) => {
                    dd.style.display = 'none';
                });

                // Clear search input
                const searchInput = container.querySelector<HTMLInputElement>("[data-live-input][type='text']");
                if (searchInput) searchInput.value = '';

                // Handle data-live-reload
                const reloadSelector = actionEl.getAttribute('data-live-reload');
                if (reloadSelector) {
                    if (window.up?.reload) {
                        try {
                            await window.up.reload(reloadSelector);
                        } catch (e) {
                            console.warn('LiveBind: Unpoly reload failed', e);
                        }
                    } else {
                        // Fallback: manual fetch and morph
                        try {
                            const reloadResp = await LiveBind.request({
                                url: window.location.href,
                                method: 'GET',
                                params: {},
                            });
                            if (reloadResp.status === 200) {
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(reloadResp.text, 'text/html');
                                const newContent = doc.querySelector(reloadSelector);
                                const currentContent = document.querySelector(reloadSelector);
                                if (newContent && currentContent) {
                                    LiveBind.morph(currentContent, newContent.innerHTML);
                                }
                            }
                        } catch (e) {
                            console.warn('LiveBind: Fallback reload failed', e);
                        }
                    }
                }
            } catch (error) {
                console.error('LiveBind: Action failed', error);
                rollback();
                LiveBind.emit(container, 'error', { error });
            } finally {
                LiveBind.setLoading(container, false);
            }
        });

        // File uploads (delegated)
        container.addEventListener('change', (e: Event) => {
            const input = e.target as HTMLInputElement;
            if (input.type !== 'file' || !input.hasAttribute('data-live-upload')) return;
            if (input.closest('[data-live-ignore]')) return;

            if (!input.files?.length) return;

            const uploadUrl = input.getAttribute('data-live-upload') || url;
            const formData = new FormData();
            formData.append(input.name || 'file', input.files[0]);

            const progressKey = input.getAttribute('data-live-progress');

            const xhr = new XMLHttpRequest();

            if (progressKey) {
                xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        LiveBind.updateOutputs({ [progressKey]: percent }, container);
                    }
                });
            }

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText) as Record<string, unknown>;
                        LiveBind.updateOutputs(data, container);
                    } catch {
                        // Ignore parse errors
                    }
                }
                LiveBind.emit(container, 'uploadComplete', { input, xhr });
            });

            xhr.open('POST', uploadUrl);
            const csrfToken = typeof document !== 'undefined' ? document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content : null;
            if (csrfToken) xhr.setRequestHeader('X-CSRF-TOKEN', csrfToken);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.send(formData);

            LiveBind.emit(container, 'uploadStart', { input });
        });
    },
};

// ==================== BATCH ====================

function collectBatchValues(container: LiveBindContainer, batchName: string): string[] {
    let scope: Element | Document = document;
    const scopeAttr = container.getAttribute('data-live-scope');
    if (scopeAttr === 'container' || container.hasAttribute('data-live-scoped')) {
        scope = container;
    } else if (scopeAttr && scopeAttr !== 'document') {
        const found = document.querySelector(scopeAttr);
        if (found) scope = found;
    }

    const values: string[] = [];
    const names = batchName.split(',').map((s) => s.trim()).filter(Boolean);

    if (names.includes('*') || !names.length) {
        scope.querySelectorAll<HTMLInputElement>('[data-live-batch]:checked').forEach((el) => {
            if (el.closest('[data-live-ignore]')) return;
            values.push(el.value);
        });
    } else {
        names.forEach((name) => {
            scope.querySelectorAll<HTMLInputElement>(`[data-live-batch="${name}"]:checked`).forEach((el) => {
                if (el.closest('[data-live-ignore]')) return;
                values.push(el.value);
            });
        });
    }

    return values;
}

// ==================== OPTIMISTIC ====================

function applyOptimistic(container: LiveBindContainer, spec: string): () => void {
    const rollbacks: Array<() => void> = [];

    spec.split(',').forEach((part) => {
        const [key, delta] = part.split(':').map((s) => s.trim());
        if (!key || !delta) return;

        container.querySelectorAll<HTMLElement>(`[data-live-output="${key}"]`).forEach((el) => {
            const originalValue = el.textContent || '';
            rollbacks.push(() => (el.textContent = originalValue));

            const currentNum = parseFloat(originalValue) || 0;
            if (delta.startsWith('+')) {
                el.textContent = String(currentNum + parseFloat(delta.slice(1)));
            } else if (delta.startsWith('-')) {
                el.textContent = String(currentNum - parseFloat(delta.slice(1)));
            } else {
                el.textContent = delta;
            }
        });
    });

    return () => rollbacks.forEach((rb) => rb());
}

export default ActionsPlugin;
export { ActionsPlugin };
