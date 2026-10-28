/**
 * Are the controls for tuning a fold's look by hand in, `engine/foldtune.ts`?
 * The build defines it false, so the package has none of them. From source it
 * is not defined at all, and every guard reads that as true.
 */
declare const DEVKNOBS_TUNE: boolean | undefined;

/**
 * The package's version, such as `0.5.1`, or `0.5.1-local.1767225600` for a
 * local copy `bun run link` builds. The build defines it; from source it is
 * not defined at all.
 */
declare const DEVKNOBS_VERSION: string | undefined;
