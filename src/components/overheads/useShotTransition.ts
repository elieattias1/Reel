"use client";

import { useEffect, useRef, useState } from "react";
import { shortestAngleDeltaDeg } from "@/lib/overheads/geometry";
import type { Shot } from "@/lib/overheads/schema";

export interface InterpolatedState {
  camera: { x: number; y: number; headingDeg: number };
  actors: { characterId: string; x: number; y: number }[];
}

const MOTION_DURATION_MS = 420;

/** cubic-bezier(0.4, 0, 0.2, 1) approximated as a cubic ease-out — close enough for a position/rotation tween, not pixel-exact to the CSS curve. */
function ease(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function snapshot(shot: Shot): InterpolatedState {
  return {
    camera: { x: shot.setup.x, y: shot.setup.y, headingDeg: shot.setup.headingDeg },
    actors: shot.actors.map((a) => ({ characterId: a.characterId, x: a.x, y: a.y })),
  };
}

/**
 * Tweens camera position/heading and matching actors' positions from the
 * previously active shot to the newly active one — `420ms`,
 * `cubic-bezier(0.4, 0, 0.2, 1)`, shortest-path heading rotation (DESIGN_
 * HANDOFF.md's motion spec). Hard-cuts instead under
 * `prefers-reduced-motion: reduce`. An actor present in the new shot but
 * not the previous one appears at its final position with no tween-in —
 * the motion spec only describes tweening "from the previous shot's
 * positions," which presumes the actor already had one.
 */
function isReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useShotTransition(activeShot: Shot): InterpolatedState {
  const [state, setState] = useState<InterpolatedState>(() => snapshot(activeShot));
  // "Adjusting state when a prop changes" (react.dev) — comparing and
  // updating `prevShotId` during render, rather than in an effect, is the
  // sanctioned way to hard-cut state synchronously on a prop change
  // without an extra render. The RAF tween path below stays in the
  // effect, where it belongs (it's genuinely async).
  const [prevShotId, setPrevShotId] = useState(activeShot.id);
  const prevShotForAnimationRef = useRef(activeShot);
  const rafRef = useRef<number | null>(null);

  if (activeShot.id !== prevShotId) {
    setPrevShotId(activeShot.id);
    if (isReducedMotion()) {
      setState(snapshot(activeShot));
    }
  }

  useEffect(() => {
    const prevShot = prevShotForAnimationRef.current;
    prevShotForAnimationRef.current = activeShot;
    if (prevShot.id === activeShot.id) return;
    if (isReducedMotion()) return; // already hard-cut synchronously during render, above

    const from = snapshot(prevShot);
    const to = snapshot(activeShot);
    const headingDelta = shortestAngleDeltaDeg(from.camera.headingDeg, to.camera.headingDeg);
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / MOTION_DURATION_MS);
      const eased = ease(t);

      setState({
        camera: {
          x: lerp(from.camera.x, to.camera.x, eased),
          y: lerp(from.camera.y, to.camera.y, eased),
          headingDeg: from.camera.headingDeg + headingDelta * eased,
        },
        actors: to.actors.map((actor) => {
          const match = from.actors.find((a) => a.characterId === actor.characterId);
          if (!match) return actor;
          return { characterId: actor.characterId, x: lerp(match.x, actor.x, eased), y: lerp(match.y, actor.y, eased) };
        }),
      });

      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [activeShot]);

  return state;
}
