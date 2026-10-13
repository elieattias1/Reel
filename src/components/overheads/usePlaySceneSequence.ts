"use client";

import { useEffect } from "react";

/** How long Play holds on each shot before advancing to the next. */
const DWELL_MS = 1500;

/**
 * While `playing`, steps `activeIndex` through every shot in the scene,
 * one after another — each step still goes through useShotTransition's
 * normal shot-to-shot tween, this just drives the advance. Stops (calling
 * `onDone`) after the last shot rather than looping.
 */
export function usePlaySceneSequence(
  playing: boolean,
  shotCount: number,
  activeIndex: number,
  onAdvance: (nextIndex: number) => void,
  onDone: () => void
) {
  useEffect(() => {
    if (!playing) return;

    // Deferred via setTimeout rather than called synchronously here —
    // onDone ultimately calls setState, and calling that straight from
    // the effect body (vs. from an async callback) is what React's
    // set-state-in-effect rule flags.
    const atLastShot = activeIndex >= shotCount - 1;
    const timer = setTimeout(() => (atLastShot ? onDone() : onAdvance(activeIndex + 1)), atLastShot ? 0 : DWELL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, activeIndex, shotCount]);
}
