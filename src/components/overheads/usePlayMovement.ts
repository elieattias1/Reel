"use client";

import { useEffect, useRef, useState } from "react";
import type { Point2D, Shot } from "@/lib/overheads/schema";
import type { InterpolatedState } from "./useShotTransition";

/**
 * Playback duration for Space's "play movement paths" (keyboard map,
 * DESIGN_HANDOFF.md). No timing is specified anywhere in the design
 * package beyond the key existing — this is a documented default, not a
 * spec value (see README "Design gaps").
 */
const PLAY_DURATION_MS = 1800;

/** Position at `fraction` (0-1) along a polyline, by cumulative distance — not by point index. */
function pointAtFraction(points: Point2D[], fraction: number): Point2D {
  if (points.length === 1) return points[0];

  const segmentLengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = segmentLengths.reduce((sum, l) => sum + l, 0);
  if (total === 0) return points[0];

  let target = fraction * total;
  for (let i = 0; i < segmentLengths.length; i++) {
    if (target <= segmentLengths[i] || i === segmentLengths.length - 1) {
      const t = segmentLengths[i] === 0 ? 0 : Math.min(1, target / segmentLengths[i]);
      const a = points[i];
      const b = points[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= segmentLengths[i];
  }
  return points[points.length - 1];
}

/**
 * While `playing`, animates the active shot's own camera movement path and
 * actor paths (if any) from start to end over `PLAY_DURATION_MS`, calling
 * `onDone` when finished. Returns null while not playing, so the caller
 * falls back to the shot-transition tween.
 */
export function usePlayMovement(activeShot: Shot, playing: boolean, onDone: () => void): InterpolatedState | null {
  const [state, setState] = useState<InterpolatedState | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;

    const cameraPoints = activeShot.setup.movementPath?.points ?? null;
    const actorTracks = activeShot.actors
      .filter((a) => a.path && a.path.length >= 2)
      .map((a) => ({ characterId: a.characterId, points: [...a.path!].sort((x, y) => x.beat - y.beat) }));

    if (!cameraPoints && actorTracks.length === 0) {
      onDone();
      return;
    }

    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / PLAY_DURATION_MS);

      setState({
        camera: cameraPoints
          ? { ...pointAtFraction(cameraPoints, t), headingDeg: activeShot.setup.headingDeg }
          : { x: activeShot.setup.x, y: activeShot.setup.y, headingDeg: activeShot.setup.headingDeg },
        actors: actorTracks.map((track) => ({ characterId: track.characterId, ...pointAtFraction(track.points, t) })),
      });

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onDone();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, activeShot.id]);

  // Derived during render, not reset via a synchronous setState(null) in
  // the effect above — same "adjust state when a prop changes" rationale
  // as useShotTransition.
  return playing ? state : null;
}
