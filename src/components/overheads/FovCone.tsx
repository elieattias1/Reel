import { conePolygon } from "@/lib/overheads/geometry";
import { toPx, pointsAttr } from "./scale";

export type FovConeState = "active" | "ghosted" | "warning" | "error";

export interface FovConeProps {
  x: number;
  y: number;
  headingDeg: number;
  lensMm: number;
  sensorWidthMm: number;
  focusDistanceFt?: number;
  state: FovConeState;
  pxPerFt: number;
}

const FILL: Record<FovConeState, string> = {
  active: "var(--color-accent-500)",
  ghosted: "var(--color-zinc-400)",
  warning: "var(--color-warning-500)",
  error: "var(--color-danger-500)",
};

const FILL_OPACITY: Record<FovConeState, number> = {
  active: 0.16,
  ghosted: 0.07,
  warning: 0.16,
  error: 0.16,
};

const STROKE_DASH: Record<FovConeState, string | undefined> = {
  active: undefined,
  ghosted: "3 3",
  warning: undefined,
  error: undefined,
};

/** The camera's horizontal field of view, geometrically real. components.md → FovCone. Geometry formula is binding, not a style choice (see lib/overheads/geometry.ts). */
export function FovCone({ x, y, headingDeg, lensMm, sensorWidthMm, focusDistanceFt, state, pxPerFt }: FovConeProps) {
  const [apex, far1, far2] = conePolygon({ x, y, headingDeg, lensMm, focusDistanceFt }, sensorWidthMm);
  const pts = [apex, far1, far2].map((p) => toPx(p, pxPerFt));

  return (
    <polygon
      points={pointsAttr(pts)}
      fill={FILL[state]}
      fillOpacity={FILL_OPACITY[state]}
      stroke={FILL[state]}
      strokeWidth={1}
      strokeDasharray={STROKE_DASH[state]}
    />
  );
}
