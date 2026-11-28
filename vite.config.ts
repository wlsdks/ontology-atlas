import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import packageJson from './package.json' with { type: 'json' };
import { rowProducerHash } from './scripts/lib/row-producer.mjs';
import { atlasAppFolder } from './scripts/vite/atlas-app-folder';
import { atlasIndexHtml } from './scripts/vite/atlas-index-html';

const root = __dirname;

/** Where the installed app's files are written. */
const APP_FOLDER = process.env.ATLAS_APP_FOLDER ?? 'src-tauri/target/desktop-frontend-vite';

/** Where the website's files are written: the same bundle with everything in `public/`, then the prerendered pages. */
const SITE_FOLDER = process.env.ATLAS_SITE_FOLDER ?? 'src-tauri/target/site-vite';

export default defineConfig(({ command, mode }) => ({
  root,
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/route-tree.gen.ts',
      autoCodeSplitting: true,
      quoteStyle: 'single',
      semicolons: true,
    }),
    react(),
    tailwindcss(),
    atlasIndexHtml(root),
    ...(mode === 'site' ? [] : [atlasAppFolder()]),
  ],
  resolve: {
    alias: [
      { find: /^@\/app-providers/, replacement: path.join(root, 'src/app') },
      { find: /^@\/views/, replacement: path.join(root, 'src/views') },
      { find: /^@\/widgets/, replacement: path.join(root, 'src/widgets') },
      { find: /^@\/features/, replacement: path.join(root, 'src/features') },
      { find: /^@\/entities/, replacement: path.join(root, 'src/entities') },
      { find: /^@\/shared/, replacement: path.join(root, 'src/shared') },
      { find: /^@\/i18n/, replacement: path.join(root, 'src/i18n') },
      { find: /^@\//, replacement: `${root}/` },
    ],
  },
  define: {
    'process.env.ATLAS_PUBLIC_RELEASE_VERSION': JSON.stringify(packageJson.version),
    // The dev server reloads source without a restart, so it names no producer and keeps no cached rows.
    'process.env.ATLAS_PUBLIC_ROW_PRODUCER': JSON.stringify(command === 'build' ? rowProducerHash() : undefined),
    'process.env.ATLAS_PUBLIC_BASE_PATH': JSON.stringify(process.env.ATLAS_PUBLIC_BASE_PATH),
    'process.env.ATLAS_PUBLIC_DOGFOOD_VAULT_PATHS': JSON.stringify(process.env.ATLAS_PUBLIC_DOGFOOD_VAULT_PATHS),
    'process.env.ATLAS_PUBLIC_GOOGLE_SITE_VERIFICATION': JSON.stringify(process.env.ATLAS_PUBLIC_GOOGLE_SITE_VERIFICATION),
    'process.env.ATLAS_PUBLIC_BING_SITE_VERIFICATION': JSON.stringify(process.env.ATLAS_PUBLIC_BING_SITE_VERIFICATION),
  },
  build: {
    outDir: mode === 'site' ? SITE_FOLDER : APP_FOLDER,
    emptyOutDir: true,
    // The prerender links the entry's files, which the manifest names.
    manifest: mode === 'site',
    // An app address in a browser runs no screen, only the small script that forgets an earlier website's folders.
    ...(mode === 'site'
      ? { rolldownOptions: { input: { index: path.join(root, 'index.html'), 'old-folder-cleanup': path.join(root, 'src/app/old-folder-cleanup.ts') } } }
      : {}),
    // Every asset is a file the WebView's `'self'` policy covers; none becomes an inline `data:` address.
    assetsInlineLimit: 0,
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    strictPort: true,
  },
}));
