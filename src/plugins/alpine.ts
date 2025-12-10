/**
 * LiveBind Alpine Plugin
 * Handles: data-live-entangle - two-way binding with Alpine.js
 */

import type { LiveBindPlugin, LiveBindContainer, LiveBindStatic } from '../types';

const AlpinePlugin: LiveBindPlugin = {
    name: 'alpine',

    onUpdateOutputs(
        _LiveBind: LiveBindStatic,
        data: Record<string, unknown>,
        container: LiveBindContainer | null
    ): void {
        if (!window.Alpine || !container) return;

        // Find elements with data-live-entangle and sync Alpine data
        container.querySelectorAll<HTMLElement>('[data-live-entangle]').forEach((el) => {
            const key = el.getAttribute('data-live-entangle');
            if (!key || !(key in data)) return;

            const alpineData = window.Alpine!.$data(el);
            if (!alpineData) return;

            if (key in alpineData) {
                alpineData[key] = data[key];
            }
        });

        // Check container itself
        if (container.hasAttribute('data-live-entangle')) {
            const key = container.getAttribute('data-live-entangle');
            if (key && key in data) {
                const alpineData = window.Alpine!.$data(container);
                if (alpineData && key in alpineData) {
                    alpineData[key] = data[key];
                }
            }
        }
    },

    initialize(_LiveBind: LiveBindStatic, container: LiveBindContainer, _url: string): void {
        if (!window.Alpine) return;

        // Setup watchers: Alpine -> LiveBind (sync to hidden inputs)
        container.querySelectorAll<HTMLElement>('[data-live-entangle]').forEach((el) => {
            const key = el.getAttribute('data-live-entangle');
            if (!key) return;

            const alpineData = window.Alpine!.$data(el);
            if (!alpineData || !(key in alpineData)) return;

            window.Alpine!.effect(() => {
                const value = alpineData[key];

                let input = container.querySelector<HTMLInputElement>(`input[name="${key}"]`);
                if (!input) {
                    input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    const form = container.tagName === 'FORM' ? container as HTMLFormElement : container.querySelector<HTMLFormElement>('form');
                    if (form) form.appendChild(input);
                }

                input.value = String(value);
            });
        });
    },
};

export default AlpinePlugin;
export { AlpinePlugin };
