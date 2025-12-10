/**
 * LiveBind Polling Plugin
 * Handles: data-live-poll, data-live-lazy
 */

const PollingPlugin = {
  name: "polling",

  initialize(LiveBind, container, url) {
    const isLazy = container.hasAttribute("data-live-lazy");

    if (isLazy) {
      this.setupLazy(LiveBind, container, url);
      return;
    }

    const pollInterval = parseInt(container.getAttribute("data-live-poll"), 10);
    if (pollInterval > 0) {
      this.setupPolling(LiveBind, container, url, pollInterval);
    }
  },

  setupPolling(LiveBind, container, url, interval) {
    let intervalId = null;
    let isPaused = false;

    const poll = async () => {
      if (isPaused || !LiveBind.isOnline) return;

      try {
        const form = container.tagName === "FORM" ? container : container.querySelector("form");
        const formData = form ? new FormData(form) : new FormData();
        const params = {};
        for (const [key, value] of formData.entries()) {
          if (value instanceof File) continue;
          params[key] = value;
        }

        const response = await LiveBind.request({ url, method: "POST", params });

        if (response.status === 200) {
          const contentType = response.contentType;
          if (contentType.includes("application/json")) {
            const data = JSON.parse(response.text);
            LiveBind.updateOutputs(data, container);
          }
        }
      } catch (error) {
        console.warn("LiveBind: Poll failed", error);
      }
    };

    const start = () => {
      if (intervalId) return;
      intervalId = setInterval(poll, interval);
    };

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Pause when tab is hidden
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        isPaused = true;
      } else {
        isPaused = false;
        poll(); // Poll immediately when becoming visible
      }
    });

    start();
    container._liveBindStopPolling = stop;
  },

  setupLazy(LiveBind, container, url) {
    const lazyUrl = container.getAttribute("data-live-url") || url;
    if (!lazyUrl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observer.disconnect();
            this.loadLazy(LiveBind, container, lazyUrl);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(container);
  },

  async loadLazy(LiveBind, container, url) {
    LiveBind.setLoading(container, true);

    try {
      const response = await LiveBind.request({ url, method: "GET", params: {} });

      if (response.status === 200) {
        LiveBind.morph(container, response.text);

        // Initialize any nested forms
        container.querySelectorAll("[data-live-form]").forEach((form) => {
          if (!form._liveBindInitialized) {
            LiveBind.initialize(form);
          }
        });
      }
    } catch (error) {
      console.error("LiveBind: Lazy load failed", error);
    } finally {
      LiveBind.setLoading(container, false);
    }
  },
};

export default PollingPlugin;
