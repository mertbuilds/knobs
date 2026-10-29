declare module 'virtual:stylex:runtime';

declare module '*.css' {
  const css: string;
  export default css;
}

/** `YYYY-MM-DD`, the day `vite` built or served the site (`define` in vite.config.ts). */
declare const __BUILD_DATE__: string;
