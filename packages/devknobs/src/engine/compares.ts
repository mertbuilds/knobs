import type * as Compare from "./compare";

/**
 * The compare layout's module, `compare.ts`, which loads the first time
 * compare comes up, from the api or the panel, so both see the same one.
 */

let loaded: typeof Compare | null = null;

export async function loadCompare(): Promise<typeof Compare> {
  loaded ??= await import("./compare");
  return loaded;
}

/** The module, once it has loaded. */
export function compareLoaded(): typeof Compare | null {
  return loaded;
}
