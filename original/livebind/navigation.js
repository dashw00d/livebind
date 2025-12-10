/**
 * LiveBind Navigation Plugin
 * Handles: data-live-link, data-live-preload, SPA-style navigation
 */

const NavigationPlugin = {
  name: "navigation",
  _preloadCache: new Map(),

  initGlobal(LiveBind) {
    this.setupLinkNavigation(LiveBind);
    this.setupPreload(LiveBind);
  },

  setupLinkNavigation(LiveBind) {
    if (LiveBind._linkNavInitialized) return;
    LiveBind._linkNavInitialized = true;

    // Handle link clicks
    document.addEventListener("click", async (e) => {
      const link = e.target.closest("a[data-live-link]");
      if (!link) return;

      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("//")) return;

      e.preventDefault();

      await this.navigateToUrl(LiveBind, href, link);
    });

    // Handle back/forward buttons
    window.addEventListener("popstate", async () => {
      await this.navigateToUrl(LiveBind, window.location.pathname + window.location.search, null, false);
    });
  },

  setupPreload(LiveBind) {
    if (LiveBind._preloadInitialized) return;
    LiveBind._preloadInitialized = true;

    document.addEventListener(
      "mouseenter",
      (e) => {
        if (!(e.target instanceof Element)) return;
        const link = e.target.closest("a[data-live-preload]");
        if (!link) return;

        const href = link.getAttribute("href");
        if (!href || href.startsWith("http") || href.startsWith("//")) return;

        if (this._preloadCache.has(href)) return;

        const preloadPromise = LiveBind.request({ url: href, method: "GET", params: {} });
        this._preloadCache.set(href, preloadPromise);

        setTimeout(() => {
          this._preloadCache.delete(href);
        }, 30000);
      },
      true
    );
  },

  async navigateToUrl(LiveBind, url, linkEl = null, pushState = true) {
    const targetSelector =
      linkEl?.getAttribute("data-live-link-target") || linkEl?.getAttribute("data-live-link") || "main";
    const target =
      targetSelector === "true" || targetSelector === ""
        ? document.querySelector("main") || document.body
        : document.querySelector(targetSelector);

    if (!target) {
      console.warn("LiveBind: Navigation target not found:", targetSelector);
      window.location.href = url;
      return;
    }

    const event = new CustomEvent("livebind:navigate", {
      bubbles: true,
      cancelable: true,
      detail: { url, target },
    });
    if (!document.dispatchEvent(event)) return;

    const transitionName = linkEl?.getAttribute("data-live-transition") || "live";

    try {
      target.classList.add(`${transitionName}-leave`);
      target.classList.add("live-loading");

      // Check preload cache first
      let response = this._preloadCache.get(url);
      if (response) {
        response = await response;
        this._preloadCache.delete(url);
      } else {
        response = await LiveBind.request({ url, method: "GET", params: {} });
      }

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}`);
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(response.text, "text/html");

      const newContent = doc.querySelector(targetSelector) || doc.querySelector("main") || doc.body;

      if (pushState) {
        window.history.pushState({}, doc.title || "", url);
      }

      if (doc.title) {
        document.title = doc.title;
      }

      target.classList.remove(`${transitionName}-leave`);
      target.classList.add(`${transitionName}-enter`);

      LiveBind.morph(target, newContent.innerHTML);

      // Initialize new LiveBind forms
      target.querySelectorAll("[data-live-form]").forEach((form) => {
        if (!form._liveBindInitialized) {
          LiveBind.initialize(form);
        }
      });

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          target.classList.remove(`${transitionName}-enter`);
          target.classList.remove("live-loading");
        });
      });
    } catch (error) {
      console.error("LiveBind: Navigation failed", error);
      target.classList.remove(`${transitionName}-leave`);
      target.classList.remove("live-loading");
      window.location.href = url;
    }
  },
};

export default NavigationPlugin;
