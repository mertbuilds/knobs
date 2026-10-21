/**
 * Where the mounted copy of devknobs leaves its way out. A dev server's hot
 * update can load a second copy of the module and run the app's `mount` call
 * again. The new copy takes the page over through it: the old one takes its
 * panel, frame and patches away first, so they never stack.
 */
const OWNER = Symbol.for("devknobs.owner");

/** Take the page for `release`. Another copy that holds it lets go first. */
export function claim(scope: object, release: () => void): void {
  const previous: unknown = Reflect.get(scope, OWNER);
  if (typeof previous === "function" && previous !== release) previous();
  Reflect.set(scope, OWNER, release);
}

/** Does another copy hold the page now? Then this one has nothing left to undo. */
export function superseded(scope: object, release: () => void): boolean {
  const owner: unknown = Reflect.get(scope, OWNER);
  return owner !== undefined && owner !== release;
}

/** Let the page go, if `release` still holds it. */
export function free(scope: object, release: () => void): void {
  if (Reflect.get(scope, OWNER) === release) Reflect.deleteProperty(scope, OWNER);
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
