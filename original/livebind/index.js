/**
 * LiveBind - Full Bundle
 * Includes all plugins by default. For custom builds, import core + specific plugins.
 *
 * Usage (default - all features):
 *   import LiveBind from 'livebind';
 *
 * Usage (custom - core + specific plugins):
 *   import LiveBind from 'livebind/core';
 *   import FormsPlugin from 'livebind/forms';
 *   import ActionsPlugin from 'livebind/actions';
 *   LiveBind.use(FormsPlugin).use(ActionsPlugin);
 */

import LiveBindCore from "./core.js";
import FormsPlugin from "./forms.js";
import ActionsPlugin from "./actions.js";
import NavigationPlugin from "./navigation.js";
import PollingPlugin from "./polling.js";
import AlpinePlugin from "./alpine.js";

// Register all plugins
LiveBindCore.use(FormsPlugin)
  .use(ActionsPlugin)
  .use(NavigationPlugin)
  .use(PollingPlugin)
  .use(AlpinePlugin);

// Export configured LiveBind
export default LiveBindCore;

// Also export individual pieces for custom builds
export { LiveBindCore, FormsPlugin, ActionsPlugin, NavigationPlugin, PollingPlugin, AlpinePlugin };
