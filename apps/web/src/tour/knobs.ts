type Knobs = typeof import('devknobs');

let loading: Promise<Knobs> | undefined;
let mounted = false;

/**
 * devknobs is most of the page's JavaScript, so it loads after hydration
 * instead of in the entry chunk. One load for the whole page, and the panel
 * mounts once. Each call queues on the same promise, so mounts and unmounts
 * run in the order they were asked for.
 */
export function mountKnobs(): Promise<Knobs> {
  loading ??= import('devknobs').catch((error: unknown) => {
    // A failed load is not kept, so the next mount tries again.
    loading = undefined;
    throw error;
  });
  return loading.then((module) => {
    if (!mounted) {
      module.mount();
      mounted = true;
    }
    return module;
  });
}

export function unmountKnobs(): void {
  void loading?.then((module) => {
    if (mounted) {
      module.unmount();
      mounted = false;
    }
  });
}
