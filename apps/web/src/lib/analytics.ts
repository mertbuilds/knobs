/** What an event carries. Undefined values are simply left out by OpenPanel. */
type EventProps = Record<string, string | undefined>;

/**
 * The queue-style `window.op` the inline loader in `__root.tsx` installs: it
 * swallows calls made before the vendor script arrives and replays them after.
 * Only the one call shape this site makes is typed.
 */
declare global {
  interface Window {
    op?: (command: 'track', name: string, props: EventProps) => void;
  }
}

/**
 * Sends one custom event. Without `VITE_OPENPANEL_CLIENT_ID` the loader never
 * runs, so there is no `window.op` and the event is dropped on the floor.
 */
export function track(name: string, props: EventProps): void {
  if (typeof window.op !== 'function') {
    return;
  }
  window.op('track', name, props);
}
