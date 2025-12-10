/**
 * LiveBind Polling Plugin
 * Handles: data-live-poll, data-live-lazy
 */

import type { LiveBindPlugin, LiveBindContainer, RequestResponse, LiveBindStatic } from '../types';

const PollingPlugin: LiveBindPlugin = {
    name: 'polling',

    initialize(LiveBind: LiveBindStatic, container: LiveBindContainer, url: string): void {
        const isLazy = container.hasAttribute('data-live-lazy');

        if (isLazy) {
            setupLazy(LiveBind, container, url);
            return;
        }

        const pollInterval = parseInt(container.getAttribute('data-live-poll') || '0', 10);
        if (pollInterval > 0) {
            setupPolling(LiveBind, container, url, pollInterval);
        }
    },
};

function setupPolling(
    LiveBind: LiveBindStatic,
    container: LiveBindContainer,
    url: string,
    interval: number
): void {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let isPaused = false;

    const poll = async (): Promise<void> => {
        if (isPaused || !LiveBind.isOnline) return;

        try {
            const form = container.tagName === 'FORM' ? container as HTMLFormElement : container.querySelector<HTMLFormElement>('form');
            const formData = form ? new FormData(form) : new FormData();
            const params: Record<string, string> = {};
            for (const [key, value] of formData.entries()) {
                if (value instanceof File) continue;
                params[key] = value as string;
            }

            const response: RequestResponse = await LiveBind.request({ url, method: 'POST', params });

            if (response.status === 200) {
                const contentType = response.contentType;
                if (contentType.includes('application/json')) {
                    const data = JSON.parse(response.text) as Record<string, unknown>;
                    LiveBind.updateOutputs(data, container);
                }
            }
        } catch (error) {
            console.warn('LiveBind: Poll failed', error);
        }
    };

    const start = (): void => {
        if (intervalId) return;
        intervalId = setInterval(poll, interval);
    };

    const stop = (): void => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };

    // Pause when tab is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            isPaused = true;
        } else {
            isPaused = false;
            poll(); // Poll immediately when becoming visible
        }
    });

    start();
    container._liveBindStopPolling = stop;
}

function setupLazy(LiveBind: LiveBindStatic, container: LiveBindContainer, url: string): void {
    const lazyUrl = container.getAttribute('data-live-url') || url;
    if (!lazyUrl) return;

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    observer.disconnect();
                    loadLazy(LiveBind, container, lazyUrl);
                }
            });
        },
        { threshold: 0.1 }
    );

    observer.observe(container);
}

async function loadLazy(LiveBind: LiveBindStatic, container: LiveBindContainer, url: string): Promise<void> {
    LiveBind.setLoading(container, true);

    try {
        const response: RequestResponse = await LiveBind.request({ url, method: 'GET', params: {} });

        if (response.status === 200) {
            LiveBind.morph(container, response.text);

            // Initialize any nested forms
            container.querySelectorAll<LiveBindContainer>('[data-live-form]').forEach((form) => {
                if (!form._liveBindInitialized) {
                    LiveBind.initialize(form);
                }
            });
        }
    } catch (error) {
        console.error('LiveBind: Lazy load failed', error);
    } finally {
        LiveBind.setLoading(container, false);
    }
}

export default PollingPlugin;
export { PollingPlugin };
