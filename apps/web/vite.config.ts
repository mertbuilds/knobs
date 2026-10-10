import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { unplugin as stylex } from '@stylexjs/unplugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { build, defineConfig, type Plugin, searchForWorkspaceRoot } from 'vite';
import web from './package.json' with { type: 'json' };
import { tuneEndpoint } from './vite.tune.ts';

const repoRoot = resolve(import.meta.dirname, '../..');

// The dev server runs devknobs from its local checkout, so the site tests the
// version in the works: DEVKNOBS_PATH (absolute, or relative to the repo root),
// else `devknobs` beside this checkout, which also holds for `knobs.dev.<branch>`
// worktrees. Builds keep the pinned npm package. The early script
// (`devknobs/early?raw`) is built from the checkout's current source too.
function localDevknobs(): Plugin {
  const wanted = resolve(repoRoot, process.env.DEVKNOBS_PATH ?? '../devknobs');
  const root = existsSync(resolve(wanted, 'src/index.ts')) ? realpathSync(wanted) : null;
  return {
    apply: (_config, { command, isPreview }) => command === 'serve' && !isPreview,
    config() {
      if (!root) {
        return;
      }
      return {
        resolve: { alias: [{ find: /^devknobs$/, replacement: resolve(root, 'src/index.ts') }] },
        server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), root] } },
      };
    },
    configResolved({ logger }) {
      if (root) {
        logger.info(`devknobs: local ${root}`);
        return;
      }
      logger.info(`devknobs: npm ${web.devDependencies.devknobs} (no local checkout at ${wanted})`);
    },
    configureServer(server) {
      if (!root) {
        return;
      }
      // The source asks for its device images beside src/engine, where the
      // build copies them; in the checkout they sit in assets/bezels.
      const from = `/@fs${root}/src/engine/bezels/`;
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith(from)) {
          req.url = `/@fs${root}/assets/bezels/${req.url.slice(from.length)}`;
        }
        next();
      });
    },
    // Before Vite's own `?raw` loader, which would read the npm package's dist.
    enforce: 'pre',
    async load(id) {
      if (!root || !/\/devknobs\/dist\/early\.global\.js\?raw$/.test(id)) {
        return;
      }
      const result = await build({
        build: {
          copyPublicDir: false,
          lib: { entry: 'src/early.ts', formats: ['iife'], name: 'devknobsEarly' },
          write: false,
        },
        configFile: false,
        envFile: false,
        logLevel: 'silent',
        root,
      });
      // One output, as an array or alone depending on how Vite was started.
      const [built] = [result].flat();
      const [chunk] = built && 'output' in built ? built.output : [];
      if (chunk?.type !== 'chunk') {
        throw new Error(`devknobs: could not build ${root}/src/early.ts`);
      }
      // An edit to any of its sources rebuilds it on the next request.
      for (const file of chunk.moduleIds) {
        this.addWatchFile(file);
      }
      return `export default ${JSON.stringify(chunk.code)};`;
    },
    name: 'local-devknobs',
  };
}

export default defineConfig({
  plugins: [
    tuneEndpoint(resolve(import.meta.dirname, '.tune')),
    localDevknobs(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    react({ compiler: true }),
    // debug:false — StyleX's dev `data-style-src` attribute embeds file:line, and the
    // React Compiler (client-only) shifts line numbers vs the SSR transform, causing a
    // hydration attribute mismatch that detaches React's event tree (dead forms).
    stylex.vite({ debug: false, enableFontSizePxToRem: true, useCSSLayers: true }),
    paraglideVitePlugin({
      cookieName: 'PARAGLIDE_LOCALE',
      outdir: './src/paraglide',
      project: './project.inlang',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
  ],
  server: {
    // Vite ignores PORT by default; portless assigns one when proxying https://knobs.localhost.
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
  },
});
