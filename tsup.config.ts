import { defineConfig } from 'tsup';

export default defineConfig([
    // Main bundle and individual modules (ESM + CJS)
    {
        entry: {
            index: 'src/index.ts',
            core: 'src/core.ts',
            'plugins/forms': 'src/plugins/forms.ts',
            'plugins/actions': 'src/plugins/actions.ts',
            'plugins/navigation': 'src/plugins/navigation.ts',
            'plugins/polling': 'src/plugins/polling.ts',
            'plugins/alpine': 'src/plugins/alpine.ts',
        },
        format: ['esm', 'cjs'],
        dts: true,
        splitting: false,
        sourcemap: true,
        clean: true,
        treeshake: true,
        minify: false,
    },
    // UMD bundle for <script> tags / CDN
    {
        entry: { 'livebind.min': 'src/index.ts' },
        format: ['iife'],
        globalName: 'LiveBind',
        minify: true,
        sourcemap: true,
        dts: false,
        // Export the default export as the global
        footer: {
            js: 'if (typeof LiveBind !== "undefined" && LiveBind.default) { LiveBind = LiveBind.default; }',
        },
    },
]);
