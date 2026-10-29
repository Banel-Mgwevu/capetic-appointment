import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPLASH_FADE_MS, SPLASH_MIN_MS, dismissSplash } from './splash';

const splash = () => document.getElementById('splash');

describe('dismissSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="splash"></div><div id="root"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('holds for the remainder of the minimum time, fades, then removes the splash', () => {
    dismissSplash({ now: 300, reduceMotion: false, automated: false });

    vi.advanceTimersByTime(SPLASH_MIN_MS - 300 - 1);
    expect(splash()).not.toHaveClass('splash--leaving');

    vi.advanceTimersByTime(1);
    expect(splash()).toHaveClass('splash--leaving');

    vi.advanceTimersByTime(SPLASH_FADE_MS);
    expect(splash()).toBeNull();
  });

  it('does not hold when the app took longer than the minimum to load', () => {
    dismissSplash({ now: SPLASH_MIN_MS + 500, reduceMotion: false, automated: false });
    vi.advanceTimersByTime(0);
    expect(splash()).toHaveClass('splash--leaving');
  });

  it('removes the splash immediately for reduced motion', () => {
    dismissSplash({ now: 0, reduceMotion: true, automated: false });
    expect(splash()).toBeNull();
  });

  it('removes the splash immediately under browser automation', () => {
    dismissSplash({ now: 0, reduceMotion: false, automated: true });
    expect(splash()).toBeNull();
  });

  it('does nothing when there is no splash', () => {
    document.body.innerHTML = '';
    expect(() => dismissSplash({ now: 0 })).not.toThrow();
  });
});
