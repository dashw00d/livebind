/**
 * LiveBind Navigation Plugin
 * Handles: data-live-link, data-live-preload, SPA-style navigation
 */

import type { LiveBindPlugin, LiveBindContainer, RequestResponse, LiveBindStatic } from '../types';

interface NavigationPluginState {
    _preloadCache: Map<string, Promise<RequestResponse>>;
    _linkNavInitialized?: boolean;
    _preloadInitialized?: boolean;
}

const pluginState: NavigationPluginState = {
    _preloadCache: new Map(),
};

const NavigationPlugin: LiveBindPlugin = {
    name: 'navigation',

    initGlobal(LiveBind: LiveBindStatic): void {
        setupLinkNavigation(LiveBind);
        setupPreload(LiveBind);
    },
};

function setupLinkNavigation(LiveBind: LiveBindStatic): void {
    if (pluginState._linkNavInitialized) return;
    pluginState._linkNavInitialized = true;

    // Handle link clicks
    document.addEventListener('click', async (e: MouseEvent) => {
        const target = e.target as Element;
        const link = target.closest<HTMLAnchorElement>('a[data-live-link]');
        if (!link) return;

        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('//')) return;

        e.preventDefault();

        await navigateToUrl(LiveBind, href, link);
    });

    // Handle back/forward buttons
    window.addEventListener('popstate', async () => {
        await navigateToUrl(LiveBind, window.location.pathname + window.location.search, null, false);
    });
}

function setupPreload(LiveBind: LiveBindStatic): void {
    if (pluginState._preloadInitialized) return;
    pluginState._preloadInitialized = true;

    document.addEventListener(
        'mouseenter',
        (e: MouseEvent) => {
            if (!(e.target instanceof Element)) return;
            const link = e.target.closest<HTMLAnchorElement>('a[data-live-preload]');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href || href.startsWith('http') || href.startsWith('//')) return;

            if (pluginState._preloadCache.has(href)) return;

            const preloadPromise = LiveBind.request({ url: href, method: 'GET', params: {} });
            pluginState._preloadCache.set(href, preloadPromise);

            setTimeout(() => {
                pluginState._preloadCache.delete(href);
            }, 30000);
        },
        true
    );
}

async function navigateToUrl(
    LiveBind: LiveBindStatic,
    url: string,
    linkEl: HTMLAnchorElement | null = null,
    pushState: boolean = true
): Promise<void> {
    const targetSelector =
        linkEl?.getAttribute('data-live-link-target') || linkEl?.getAttribute('data-live-link') || 'main';
    const target =
        targetSelector === 'true' || targetSelector === ''
            ? document.querySelector<HTMLElement>('main') || document.body
            : document.querySelector<HTMLElement>(targetSelector);

    if (!target) {
        console.warn('LiveBind: Navigation target not found:', targetSelector);
        window.location.href = url;
        return;
    }

    const event = new CustomEvent('livebind:navigate', {
        bubbles: true,
        cancelable: true,
        detail: { url, target },
    });
    if (!document.dispatchEvent(event)) return;

    const transitionName = linkEl?.getAttribute('data-live-transition') || 'live';

    try {
        target.classList.add(`${transitionName}-leave`);
        target.classList.add('live-loading');

        // Check preload cache first
        let response: RequestResponse;
        const cachedPromise = pluginState._preloadCache.get(url);
        if (cachedPromise) {
            response = await cachedPromise;
            pluginState._preloadCache.delete(url);
        } else {
            response = await LiveBind.request({ url, method: 'GET', params: {} });
        }

        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}`);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(response.text, 'text/html');

        const newContent = doc.querySelector(targetSelector) || doc.querySelector('main') || doc.body;

        if (pushState) {
            window.history.pushState({}, doc.title || '', url);
        }

        if (doc.title) {
            document.title = doc.title;
        }

        target.classList.remove(`${transitionName}-leave`);
        target.classList.add(`${transitionName}-enter`);

        LiveBind.morph(target, newContent.innerHTML);

        // Initialize new LiveBind forms
        target.querySelectorAll<LiveBindContainer>('[data-live-form]').forEach((form) => {
            if (!form._liveBindInitialized) {
                LiveBind.initialize(form);
            }
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                target.classList.remove(`${transitionName}-enter`);
                target.classList.remove('live-loading');
            });
        });
    } catch (error) {
        console.error('LiveBind: Navigation failed', error);
        target.classList.remove(`${transitionName}-leave`);
        target.classList.remove('live-loading');
        window.location.href = url;
    }
}

export default NavigationPlugin;
export { NavigationPlugin };
