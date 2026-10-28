import { describe, expect, test } from 'bun:test';
import { type BuildFacts, localLabel } from '../scripts/label.ts';

const facts = (patch: Partial<BuildFacts> = {}): BuildFacts => ({
  branch: 'ios26-preview',
  dirty: false,
  env: {},
  folder: '/code/knobs.dev.ios26',
  sha: '9e966ae',
  ...patch,
});

describe('localLabel', () => {
  test('names the branch and the commit', () => {
    expect(localLabel('0.5.1', facts())).toBe('0.5.1 · local ios26-preview (9e966ae)');
  });

  test('takes KNOBS_BUILD_LABEL over the branch', () => {
    expect(localLabel('0.5.1', facts({ env: { KNOBS_BUILD_LABEL: 'try' } }))).toBe(
      '0.5.1 · local try (9e966ae)',
    );
  });

  test('names the worktree folder with HEAD detached', () => {
    expect(localLabel('0.5.1', facts({ branch: null }))).toBe(
      '0.5.1 · local knobs.dev.ios26 (9e966ae)',
    );
  });

  test('marks uncommitted changes', () => {
    expect(localLabel('0.5.1', facts({ dirty: true }))).toBe(
      '0.5.1 · local ios26-preview (9e966ae+dirty)',
    );
  });

  test('gives CI and release builds none', () => {
    expect(localLabel('0.5.1', facts({ env: { CI: 'true' } }))).toBeNull();
    expect(localLabel('0.5.1', facts({ env: { KNOBS_RELEASE: '1' } }))).toBeNull();
  });
});
