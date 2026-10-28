/**
 * Where the mounted copy of devknobs leaves its way out. A dev server's hot
 * update can load a second copy of the module and run the app's `mount` call
 * again. The new copy takes the page over through it: the old one takes its
 * panel, frame and patches away first, so they never stack.
 */
const OWNER = Symbol.for("devknobs.owner");

/**
 * Beside the way out, what a copy mounted as the page's host leaves, such as
 * the extension's: a copy the page mounts after it hands its options over
 * here and does not take over. A copy that knows no hosts never reads it.
 */
const HOST = Symbol.for("devknobs.host");

/** A page copy's way to have the page from a host that steps aside, with what the host hands it. */
export type Take = (handed: object) => boolean;

/** A host, as `HOST` holds it. */
export interface Host {
  /** The host's way out, the one `OWNER` holds while the host has the page. */
  release: () => void;
  /**
   * Take what a copy the page mounts asks for, from its mount options. With
   * `take`, that copy's way to have the page instead, should the host step
   * aside for it, now or later: the host lets go first and hands it what it
   * keeps for it, and it says whether it took the page. Older copies leave none.
   */
  adopt: (options: object, take?: Take) => void;
  /** The host's api, where a copy that defers to it sends its own calls. Older hosts leave none. */
  api?: object;
}

function isHost(value: unknown): value is Host {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "release") === "function" &&
    typeof Reflect.get(value, "adopt") === "function"
  );
}

/**
 * Take the page for `release`. Another copy that holds it lets go first. With
 * `adopt`, the copy holds it as the host: copies the page mounts later hand
 * their options to `adopt`, and their calls to `api`.
 */
export function claim(
  scope: object,
  release: () => void,
  adopt?: (options: object, take?: Take) => void,
  api?: object,
): void {
  const previous: unknown = Reflect.get(scope, OWNER);
  if (typeof previous === "function" && previous !== release) previous();
  Reflect.set(scope, OWNER, release);
  if (adopt) Reflect.set(scope, HOST, { release, adopt, api } satisfies Host);
  else Reflect.deleteProperty(scope, HOST);
}

/** The host that holds the page now, or null where none does. */
export function hostOf(scope: object): Host | null {
  const host: unknown = Reflect.get(scope, HOST);
  return isHost(host) && host.release === Reflect.get(scope, OWNER) ? host : null;
}

/** Does any copy of devknobs hold the page now? */
export function owned(scope: object): boolean {
  return typeof Reflect.get(scope, OWNER) === "function";
}

/** Does another copy hold the page now? Then this one has nothing left to undo. */
export function superseded(scope: object, release: () => void): boolean {
  const owner: unknown = Reflect.get(scope, OWNER);
  return owner !== undefined && owner !== release;
}

/** Let the page go, if `release` still holds it. */
export function free(scope: object, release: () => void): void {
  if (Reflect.get(scope, OWNER) === release) Reflect.deleteProperty(scope, OWNER);
  const host: unknown = Reflect.get(scope, HOST);
  if (isHost(host) && host.release === release) Reflect.deleteProperty(scope, HOST);
}

const PINNED = Symbol.for("devknobs.pinned");

/** Hand the page's agents the api, at `window.devknobs`. */
export function expose(scope: object, api: object): void {
  Reflect.set(scope, "devknobs", api);
}

/** Keep the api on the page after unmount, as the script tag build does, so it can mount again. */
export function pin(scope: object): void {
  Reflect.set(scope, PINNED, true);
}

/** Take the api away, if it is still the one this copy put there and not pinned. */
export function withdraw(scope: object, api: object): void {
  if (Reflect.get(scope, PINNED) === true) return;
  if (Reflect.get(scope, "devknobs") === api) Reflect.deleteProperty(scope, "devknobs");
}
