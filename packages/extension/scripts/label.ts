// What a local build of the extension calls itself, so chrome://extensions and the panel's
// footer tell it from the store's: `0.5.1 · local ios26-preview (9e966ae+dirty)`.
import { basename } from 'node:path';

export interface BuildFacts {
  // The checked out branch, null with HEAD detached.
  branch: string | null;
  dirty: boolean;
  // `KNOBS_BUILD_LABEL`, `CI` and `KNOBS_RELEASE` from the environment.
  env: Record<string, string | undefined>;
  // The worktree's folder, the label when HEAD is detached.
  folder: string;
  // `git rev-parse --short HEAD`.
  sha: string;
}

// Null for a release or CI build, which keeps the manifest's own version.
export function localLabel(version: string, facts: BuildFacts): string | null {
  const { env } = facts;
  if (env.CI === 'true' || env.KNOBS_RELEASE === '1') {
    return null;
  }
  const label = env.KNOBS_BUILD_LABEL || facts.branch || basename(facts.folder);
  return `${version} · local ${label} (${facts.sha}${facts.dirty ? '+dirty' : ''})`;
}

function git(cwd: string, ...args: Array<string>): string {
  const result = Bun.spawnSync(['git', ...args], { cwd });
  return result.success ? result.stdout.toString().trim() : '';
}

export function buildFacts(cwd: string): BuildFacts {
  const branch = git(cwd, 'symbolic-ref', '--short', '-q', 'HEAD');
  return {
    branch: branch || null,
    dirty: git(cwd, 'status', '--porcelain') !== '',
    env: process.env,
    folder: git(cwd, 'rev-parse', '--show-toplevel') || cwd,
    sha: git(cwd, 'rev-parse', '--short', 'HEAD'),
  };
}
