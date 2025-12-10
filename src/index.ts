/**
 * LiveBind - Full Bundle
 * Includes all plugins by default. For custom builds, import core + specific plugins.
 *
 * Usage (default - all features):
 *   import LiveBind from 'livebind';
 *
 * Usage (custom - core + specific plugins):
 *   import { LiveBindCore } from 'livebind/core';
 *   import { FormsPlugin } from 'livebind/plugins/forms';
 *   import { ActionsPlugin } from 'livebind/plugins/actions';
 *   LiveBindCore.use(FormsPlugin).use(ActionsPlugin);
 */

import LiveBindCore from './core';
import FormsPlugin from './plugins/forms';
import ActionsPlugin from './plugins/actions';
import NavigationPlugin from './plugins/navigation';
import PollingPlugin from './plugins/polling';
import AlpinePlugin from './plugins/alpine';

// Re-export types
export type {
    LiveBindPlugin,
    LiveBindContainer,
    LiveBindStatic,
    RequestOptions,
    RequestResponse,
    LiveBindEventDetail,
    TargetInitialState,
} from './types';

// Register all plugins
LiveBindCore.use(FormsPlugin)
    .use(ActionsPlugin)
    .use(NavigationPlugin)
    .use(PollingPlugin)
    .use(AlpinePlugin);

// Export configured LiveBind as default
export default LiveBindCore;

// Also export individual pieces for custom builds
export {
    LiveBindCore,
    FormsPlugin,
    ActionsPlugin,
    NavigationPlugin,
    PollingPlugin,
    AlpinePlugin,
};
