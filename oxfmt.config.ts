import { defineConfig } from 'oxfmt';

export default defineConfig({
  experimentalSortImports: { newlinesBetween: false },
  experimentalSortPackageJson: { sortScripts: true },
  ignorePatterns: [
    'node_modules',
    'dist',
    '.output',
    '.turbo',
    'storybook-static',
    'apps/web/src/paraglide',
    'apps/web/src/routeTree.gen.ts',
    '.wrangler',
    'pnpm-lock.yaml',
    '.claude/skills',
    // devknobs keeps its own style and checks (bun test, tsc).
    'packages/devknobs',
  ],
  singleQuote: true,
});
