/** How long the splash stays up at minimum, so it reads as intentional rather than a flash. */
export const SPLASH_MIN_MS = 1100;
/** Must match the opacity transition on #splash in index.html. */
export const SPLASH_FADE_MS = 400;

interface DismissOptions {
  /** Milliseconds since navigation start; defaults to performance.now(). */
  now?: number;
  reduceMotion?: boolean;
  /** True under browser automation (Playwright), where the hold only slows tests down. */
  automated?: boolean;
}

/**
 * Fades out and removes the static splash screen rendered by index.html.
 *
 * The splash is plain HTML/CSS so it paints before the JS bundle has loaded;
 * this runs once React has mounted. It waits out the remainder of
 * SPLASH_MIN_MS, then fades. With reduced motion (or under automation) it is
 * removed immediately with no animation.
 */
export function dismissSplash(options: DismissOptions = {}): void {
  const splash = document.getElementById('splash');
  if (!splash) return;

  const reduceMotion = options.reduceMotion ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const automated = options.automated ?? navigator.webdriver === true;
  if (reduceMotion || automated) {
    splash.remove();
    return;
  }

  const now = options.now ?? performance.now();
  window.setTimeout(
    () => {
      splash.classList.add('splash--leaving');
      window.setTimeout(() => splash.remove(), SPLASH_FADE_MS);
    },
    Math.max(0, SPLASH_MIN_MS - now),
  );
}
