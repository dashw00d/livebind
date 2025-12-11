/**
 * LiveBind Core
 * Base class with request adapter, morph adapter, events, and utilities
 * This is the minimal foundation - add plugins for more features
 */

import type {
    LiveBindPlugin,
    LiveBindContainer,
    RequestOptions,
    RequestResponse,
} from './types';

class LiveBindCore {
    // ==================== STATIC STATE ====================
    static isOnline: boolean = true;
    private static _globalInitialized: boolean = false;
    private static _plugins: LiveBindPlugin[] = [];

    // ==================== PLUGIN SYSTEM ====================

    /**
     * Register a plugin to extend LiveBind functionality
     */
    static use(plugin: LiveBindPlugin): typeof LiveBindCore {
        if (this._plugins.find((p) => p.name === plugin.name)) return this;
        this._plugins.push(plugin);

        // Run setup immediately if already initialized
        if (plugin.setup) {
            plugin.setup(this);
        }

        return this; // Chainable
    }

    /**
     * Get registered plugin by name
     */
    static getPlugin(name: string): LiveBindPlugin | undefined {
        return this._plugins.find((p) => p.name === name);
    }

    // ==================== REQUEST ADAPTER ====================

    /**
     * Platform-agnostic request adapter
     * Priority: Unpoly > fetch
     */
    static async request({
        url,
        method = 'POST',
        params = {},
    }: RequestOptions): Promise<RequestResponse> {
        // Serialize params - handle arrays properly for PHP
        const serializeParams = (obj: Record<string, unknown>): URLSearchParams => {
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(obj)) {
                if (Array.isArray(value)) {
                    value.forEach((v) => searchParams.append(`${key}[]`, String(v)));
                } else {
                    searchParams.append(key, String(value));
                }
            }
            return searchParams;
        };

        // Flatten params for frameworks that don't handle arrays
        const flattenParams = (obj: Record<string, unknown>): Record<string, string> => {
            const result: Record<string, string> = {};
            for (const [key, value] of Object.entries(obj)) {
                if (Array.isArray(value)) {
                    value.forEach((v, i) => {
                        result[`${key}[${i}]`] = String(v);
                    });
                } else {
                    result[key] = String(value);
                }
            }
            return result;
        };

        // Unpoly
        if (window.up?.request) {
            try {
                const resp = await window.up.request({
                    url,
                    method,
                    params: flattenParams(params as Record<string, unknown>),
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                });
                return {
                    text: resp.text,
                    status: resp.status || 200,
                    contentType: resp.contentType || '',
                };
            } catch (error: unknown) {
                const err = error as { response?: { text?: string; status?: number; contentType?: string } };
                const resp = err.response || err;
                if (resp && typeof (resp as { text?: string }).text === 'string') {
                    return {
                        text: (resp as { text: string }).text,
                        status: (resp as { status?: number }).status || 422,
                        contentType: (resp as { contentType?: string }).contentType || '',
                    };
                }
                throw error;
            }
        }

        // Vanilla fetch
        const csrfToken = typeof document !== 'undefined' ? document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content : null;
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json, text/html',
        };
        if (csrfToken) {
            headers['X-CSRF-TOKEN'] = csrfToken;
        }

        let finalUrl = url;
        let body: URLSearchParams | undefined;

        if (method === 'GET') {
            const qs = serializeParams(params as Record<string, unknown>).toString();
            if (qs) {
                finalUrl += (url.includes('?') ? '&' : '?') + qs;
            }
        } else {
            body = serializeParams(params as Record<string, unknown>);
        }

        const resp = await fetch(finalUrl, {
            method,
            headers,
            body,
        });

        return {
            text: await resp.text(),
            status: resp.status,
            contentType: resp.headers.get('Content-Type') || '',
        };
    }

    // ==================== MORPH ADAPTER ====================

    /**
     * Platform-agnostic DOM morph adapter
     * Priority: idiomorph > morphdom > innerHTML
     */
    static morph(target: Element, html: string): void {
        if (window.Idiomorph?.morph) {
            window.Idiomorph.morph(target, html, { morphStyle: 'innerHTML' });
            return;
        }

        if (window.morphdom) {
            const template = document.createElement('template');
            template.innerHTML = html;
            window.morphdom(target, template.content.firstElementChild || template.content, {
                childrenOnly: true,
            });
            return;
        }

        target.innerHTML = html;
    }

    // ==================== EVENTS ====================

    static emit(container: Element, eventName: string, detail: Record<string, unknown> = {}): CustomEvent {
        const event = new CustomEvent(`livebind:${eventName}`, {
            bubbles: true,
            cancelable: true,
            detail,
        });
        container.dispatchEvent(event);
        return event;
    }

    // ==================== UTILITIES ====================

    static debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
        let timeoutId: ReturnType<typeof setTimeout>;
        return (...args: Parameters<T>) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn(...args), delay);
        };
    }

    static throttle<T extends (...args: unknown[]) => void>(fn: T, limit: number): (...args: Parameters<T>) => void {
        let inThrottle = false;
        return (...args: Parameters<T>) => {
            if (!inThrottle) {
                fn(...args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    // ==================== GLOBAL INITIALIZATION ====================

    static initGlobal(): void {
        if (this._globalInitialized) return;
        this._globalInitialized = true;

        // Online/offline detection
        if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
            this.isOnline = navigator.onLine;
            window.addEventListener('online', () => {
                this.isOnline = true;
                // WeakSet cannot be iterated, so we rely on finding elements in DOM
                document.querySelectorAll<HTMLElement>('[data-live-offline]').forEach((el) => {
                    el.hidden = true;
                    el.style.display = 'none';
                });
                document.querySelectorAll<LiveBindContainer>('[data-live-form]').forEach((container) => {
                    this.emit(container, 'online', {});
                });
            });
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('offline', () => {
                this.isOnline = false;
                // WeakSet cannot be iterated, rely on DOM query
                document.querySelectorAll<HTMLElement>('[data-live-offline]').forEach((el) => {
                    el.hidden = false;
                    el.style.display = '';
                });
                document.querySelectorAll<LiveBindContainer>('[data-live-form]').forEach((container) => {
                    this.emit(container, 'offline', {});
                });
            });
        }

        // Run plugin global setups
        this._plugins.forEach((plugin) => {
            if (plugin.initGlobal) plugin.initGlobal(this);
        });
    }

    // ==================== OUTPUT UPDATES ====================

    static updateOutputs(data: Record<string, unknown>, container: LiveBindContainer | null = null): void {
        let scope: Element | Document = document;

        if (container) {
            const scopeAttr = container.getAttribute('data-live-scope');
            if (scopeAttr === 'container' || container.hasAttribute('data-live-scoped')) {
                scope = container;
            } else if (scopeAttr && scopeAttr !== 'document') {
                const found = document.querySelector(scopeAttr);
                if (found) scope = found;
            }
        }

        Object.entries(data).forEach(([key, value]) => {
            scope.querySelectorAll<HTMLElement>(`[data-live-output="${key}"]`).forEach((el) => {
                if (el.closest('[data-live-ignore]')) return;

                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    (el as HTMLInputElement | HTMLTextAreaElement).value = String(value);
                } else if (el.tagName === 'SELECT' || el.tagName === 'PROGRESS') {
                    (el as HTMLSelectElement | HTMLProgressElement).value = String(value);
                } else {
                    el.textContent = String(value);
                }
            });

            scope.querySelectorAll<HTMLInputElement>(`[data-live-model="${key}"]`).forEach((el) => {
                if (el.closest('[data-live-ignore]')) return;

                if (el.type === 'checkbox') {
                    el.checked = Boolean(value);
                } else if (el.type === 'radio') {
                    el.checked = el.value === String(value);
                } else {
                    el.value = String(value);
                }
            });
        });

        // Plugin hook for output updates
        this._plugins.forEach((plugin) => {
            if (plugin.onUpdateOutputs) plugin.onUpdateOutputs(this, data, container);
        });
    }

    // ==================== LOADING STATE ====================

    static setLoading(container: LiveBindContainer, isLoading: boolean): void {
        const loadingEl = container.querySelector<HTMLElement>('[data-live-loading]');
        const debounceMs = parseInt(container.getAttribute('data-live-debounce-loading') || '0', 10);

        if (isLoading) {
            if (debounceMs > 0) {
                container._loadingShowTimeout = setTimeout(() => {
                    if (loadingEl) loadingEl.style.display = '';
                    container.classList.add('live-loading');
                }, debounceMs);
            } else {
                if (loadingEl) loadingEl.style.display = '';
                container.classList.add('live-loading');
            }
        } else {
            if (container._loadingShowTimeout) {
                clearTimeout(container._loadingShowTimeout);
                container._loadingShowTimeout = undefined;
            }
            if (loadingEl) loadingEl.style.display = 'none';
            container.classList.remove('live-loading');
        }
    }

    // ==================== INITIALIZE ====================

    static initialize(container: LiveBindContainer): void {
        this.initGlobal();

        if (container._liveBindInitialized) return;
        container._liveBindInitialized = true;

        const url = container.getAttribute('data-live-url');
        if (!url) {
            console.error('LiveBind: Missing data-live-url attribute on', container);
            return;
        }

        // Offline indicators
        container.querySelectorAll<HTMLElement>('[data-live-offline]').forEach((el) => {
            el.hidden = this.isOnline;
            el.style.display = this.isOnline ? 'none' : '';
        });

        // Run plugin initializers
        this._plugins.forEach((plugin) => {
            if (plugin.initialize) plugin.initialize(this, container, url);
        });
    }
}

export default LiveBindCore;
export { LiveBindCore };
