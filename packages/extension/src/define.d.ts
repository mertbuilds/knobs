/**
 * The build's own suffix for the events between the page world and the bridge, so
 * where two copies of the extension run on one page, each talks to its own. The
 * build defines it; in tests it is not defined at all.
 */
declare const KNOBS_CHANNEL: string | undefined;

/** `local` for a local build, labeled in its manifest, else `store`. The build defines it. */
declare const KNOBS_BUILD: 'store' | 'local' | undefined;
