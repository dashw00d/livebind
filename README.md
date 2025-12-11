# LiveBind

**Livewire-like reactivity for any backend.** Lightweight, framework-agnostic, plugin-based.

LiveBind provides reactive form handling, AJAX actions, SPA-style navigation, polling, and more — all with simple HTML data attributes. Works with any backend (PHP, Node, Python, Ruby, Go, etc.).

## Features

- 🔄 **Reactive Forms** - Auto-sync form inputs with server responses
- ⚡ **Actions** - Click-triggered AJAX with confirmation, optimistic updates
- 🧭 **SPA Navigation** - Smooth page transitions without full reloads
- 📊 **Polling** - Real-time updates with configurable intervals
- 🏔️ **Alpine.js Integration** - Two-way binding with Alpine data
- 📦 **Tree-Shakeable** - Import only what you need
- 🪶 **Tiny** - ~8KB minified and gzipped (full bundle)

## Installation

```bash
npm install livebind
```

### CDN / Script Tag

```html
<script src="https://unpkg.com/livebind/dist/livebind.min.js"></script>
```

## Quick Start

### Full Bundle (All Plugins)

```typescript
import LiveBind from 'livebind';

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-live-form]').forEach((el) => {
    LiveBind.initialize(el as HTMLElement);
  });
});
```

### Custom Bundle (Tree-Shaking)

```typescript
import { LiveBindCore } from 'livebind/core';
import { FormsPlugin } from 'livebind/plugins/forms';
import { ActionsPlugin } from 'livebind/plugins/actions';

// Register only the plugins you need
LiveBindCore.use(FormsPlugin).use(ActionsPlugin);

// Initialize
document.querySelectorAll('[data-live-form]').forEach((el) => {
  LiveBindCore.initialize(el as HTMLElement);
});
```

## HTML Examples

### Reactive Search

```html
<div data-live-form data-live-url="/api/search">
  <input type="text" data-live-input name="query" placeholder="Search..." />
  
  <div data-live-target="results">
    <!-- Results appear here -->
  </div>
  
  <span data-live-loading style="display: none;">Searching...</span>
</div>
```

### Actions with Confirmation

```html
<div data-live-form data-live-url="/api/items">
  <button 
    data-live-action="/api/items/5/delete" 
    data-live-method="DELETE"
    data-live-confirm="Are you sure?"
  >
    Delete Item
  </button>
</div>
```

### Optimistic Updates

```html
<div data-live-form data-live-url="/api/likes">
  <span data-live-output="likeCount">42</span> likes
  
  <button 
    data-live-action="/api/posts/1/like"
    data-live-optimistic="likeCount: +1"
  >
    👍 Like
  </button>
</div>
```

### Action with Partial Reload

```html
<div data-live-form data-live-url="/api/tasks">
  <!-- This list will be reloaded after the action completes -->
  <ul id="task-list">
    <li>Task 1</li>
    <li>Task 2</li>
  </ul>
  
  <button 
    data-live-action="/api/tasks/clear-completed" 
    data-live-reload="#task-list"
  >
    Clear Completed
  </button>
</div>
```

### Batch Actions

```html
<div data-live-form data-live-url="/api/batch">
  <input type="checkbox" data-live-batch="ids" value="1" />
  <input type="checkbox" data-live-batch="ids" value="2" />
  <input type="checkbox" data-live-batch="ids" value="3" />
  
  <button 
    data-live-action="/api/batch/delete" 
    data-live-batch-action="ids"
    data-live-confirm="Delete selected items?"
  >
    Delete Selected
  </button>
</div>
```

### File Upload with Progress

```html
<div data-live-form data-live-url="/api/upload">
  <input 
    type="file" 
    name="document"
    data-live-upload="/api/upload"
    data-live-progress="uploadProgress"
  />
  
  <progress data-live-output="uploadProgress" value="0" max="100"></progress>
</div>
```

### Polling

```html
<div data-live-form data-live-url="/api/dashboard" data-live-poll="5000">
  <span data-live-output="activeUsers">0</span> active users
</div>
```

### Lazy Loading

```html
<div data-live-form data-live-url="/api/comments" data-live-lazy>
  <span data-live-loading>Loading comments...</span>
  <div data-live-target="content"></div>
</div>
```

### SPA Navigation

```html
<nav>
  <a href="/dashboard" data-live-link="main" data-live-preload>Dashboard</a>
  <a href="/settings" data-live-link="main" data-live-preload>Settings</a>
</nav>

<main>
  <!-- Content morphs here on navigation -->
</main>
```

## Data Attributes Reference

### Container Attributes

| Attribute | Description |
|-----------|-------------|
| `data-live-form` | Mark element as a LiveBind container |
| `data-live-url` | Server endpoint URL |
| `data-live-delay="300"` | Debounce delay in ms (default: 300) |
| `data-live-throttle="500"` | Throttle instead of debounce |
| `data-live-defer` | Don't auto-submit; wait for submit button |
| `data-live-native` | Allow native form submission (bypasses LiveBind) |
| `data-live-ignore` | Prevent LiveBind from processing this element and its children |
| `data-live-scope="selector"` | Define scope for outputs/batch (default: 'container', 'document', or selector) |
| `data-live-scoped` | Alias for `data-live-scope="container"` |
| `data-live-poll="5000"` | Poll interval in ms |
| `data-live-lazy` | Load content when element becomes visible |

### Input Attributes

| Attribute | Description |
|-----------|-------------|
| `data-live-input` | Auto-submit on input change |
| `data-live-model="key"` | Two-way bind to output |
| `data-live-min-length="3"` | Minimum characters before triggering |
| `data-live-show-on-focus="target"` | Show target element on focus |

### Output Attributes

| Attribute | Description |
|-----------|-------------|
| `data-live-output="key"` | Update from JSON response |
| `data-live-target="key"` | Update innerHTML from HTML response |
| `data-live-error="fieldName"` | Display validation error |
| `data-live-transition="fade"` | CSS transition class prefix |

### Action Attributes

| Attribute | Description |
|-----------|-------------|
| `data-live-action="/url"` | Action endpoint URL |
| `data-live-method="POST"` | HTTP method (default: POST) |
| `data-live-confirm="Are you sure?"` | Confirmation dialog |
| `data-live-optimistic="key: +1"` | Optimistic update spec |
| `data-live-param-foo="bar"` | Add parameter to request |
| `data-live-batch="name"` | Checkbox batch group |
| `data-live-batch-action="names"` | Collect batch values (comma-separated or `*` for all) |
| `data-live-reload="selector"` | Reload target element after success (via Unpoly or fetch) |
| `data-live-navigate` | Push URL to history |

### File Upload Attributes

| Attribute | Description |
|-----------|-------------|
| `data-live-upload="/url"` | Upload endpoint (or uses data-live-url) |
| `data-live-progress="key"` | Output key for upload progress % |

### UI State Attributes

| Attribute | Description |
|-----------|-------------|
| `data-live-loading` | Show while request in progress |
| `data-live-offline` | Show when navigator is offline |
| `data-live-dirty` | Show when form is dirty |
| `data-live-pristine` | Disable/hide when form is dirty |
| `data-live-dropdown` | Keyboard-navigable dropdown |

### Navigation Attributes

| Attribute | Description |
|-----------|-------------|
| `data-live-link="selector"` | SPA navigation target selector |
| `data-live-link-target="selector"` | Alternative target selector |
| `data-live-preload` | Preload on hover |
| `data-live-transition="fade"` | Navigation transition class |

## Events

Listen for LiveBind events on containers:

```javascript
container.addEventListener('livebind:beforeUpdate', (e) => {
  console.log('About to update', e.detail);
});

container.addEventListener('livebind:afterUpdate', (e) => {
  console.log('Update complete', e.detail.response);
});

container.addEventListener('livebind:error', (e) => {
  console.log('Error', e.detail.error || e.detail.status);
});

container.addEventListener('livebind:action', (e) => {
  console.log('Action triggered', e.detail.actionParams);
});

container.addEventListener('livebind:dirty', () => {
  console.log('Form has unsaved changes');
});

container.addEventListener('livebind:pristine', () => {
  console.log('Form is clean');
});
```

## Server Response Formats

### JSON Response

```json
{
  "searchResults": "Found 42 items",
  "totalCount": 42
}
```

Automatically updates `[data-live-output="searchResults"]` and `[data-live-output="totalCount"]`.

### HTML Response

```html
<div data-live-target="results">
  <ul>
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
</div>
```

Morphs the content into `[data-live-target="results"]`.

### Validation Errors (422)

```json
{
  "errors": {
    "email": ["The email field is required."],
    "password": ["Password must be at least 8 characters."]
  }
}
```

Automatically displays in `[data-live-error="email"]` and `[data-live-error="password"]`.

## Morph Adapters

LiveBind uses intelligent DOM morphing for smooth updates:

1. **Idiomorph** (recommended) - `<script src="idiomorph.min.js"></script>`
2. **morphdom** - `<script src="morphdom.min.js"></script>`
3. **innerHTML** (fallback) - No dependencies

## Request Adapters

LiveBind automatically uses the best available:

1. **Unpoly** - If `up.request` is available
2. **fetch** - Standard Fetch API (fallback)

## TypeScript Support

Full TypeScript definitions included:

```typescript
import type { 
  LiveBindPlugin, 
  LiveBindContainer, 
  RequestResponse 
} from 'livebind';
```

## Creating Custom Plugins

```typescript
import type { LiveBindPlugin, LiveBindContainer } from 'livebind';
import { LiveBindCore } from 'livebind/core';

const MyPlugin: LiveBindPlugin = {
  name: 'my-plugin',
  
  // Called once when .use() is called
  setup(LiveBind) {
    console.log('Plugin registered');
  },
  
  // Called once globally
  initGlobal(LiveBind) {
    document.addEventListener('click', () => {});
  },
  
  // Called for each container
  initialize(LiveBind, container, url) {
    console.log('Container initialized:', container);
  },
  
  // Called when outputs are updated
  onUpdateOutputs(LiveBind, data, container) {
    console.log('Outputs updated:', data);
  },
};

LiveBindCore.use(MyPlugin);
```

## Local Development

To develop LiveBind locally while using it in another project:

1. **In this directory:**
   ```bash
   npm link
   npm run dev  # Watches for changes and rebuilds
   ```

2. **In your application directory:**
   ```bash
   npm link livebind
   ```
   Now any changes you make in `src/` will instantly update in your application (after a quick rebuild).

## License

MIT
