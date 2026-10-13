import { headingToUnitVector } from "@/lib/overheads/geometry";
import { toPx } from "./scale";

export type CameraGlyphState =
  | "default"
  | "active"
  | "ghosted"
  | "hover"
  | "selected"
  | "dragging"
  | "warning"
  | "error";

export interface CameraGlyphProps {
  x: number;
  y: number;
  headingDeg: number;
  label: string;
  state: CameraGlyphState;
  pxPerFt: number;
}

const FILL: Record<CameraGlyphState, string> = {
  default: "var(--color-accent-600)",
  active: "var(--color-accent-500)",
  ghosted: "var(--color-zinc-400)",
  hover: "var(--color-accent-500)",
  selected: "var(--color-accent-600)",
  dragging: "var(--color-accent-500)",
  warning: "var(--color-warning-500)",
  error: "var(--color-danger-500)",
};

const RADIUS: Record<CameraGlyphState, number> = {
  default: 12,
  active: 13,
  ghosted: 10,
  hover: 12,
  selected: 12,
  dragging: 12,
  warning: 12,
  error: 12,
};

const FILL_OPACITY: Record<CameraGlyphState, number> = {
  default: 1,
  active: 1,
  ghosted: 0.55,
  hover: 1,
  selected: 1,
  dragging: 0.7,
  warning: 1,
  error: 1,
};

/** One camera setup: position, heading, identity, size/lens readout lives in the shot-detail panel, not here. components.md → CameraGlyph. */
export function CameraGlyph({ x, y, headingDeg, label, state, pxPerFt }: CameraGlyphProps) {
  const center = toPx({ x, y }, pxPerFt);
  const r = RADIUS[state];
  const tickLength = state === "ghosted" ? 11 : 14;
  const dir = headingToUnitVector(headingDeg);
  const tickEnd = { x: center.x + dir.x * tickLength, y: center.y + dir.y * tickLength };
  const badgeDir = headingToUnitVector(headingDeg + 180);
  const badgeCenter = { x: center.x + badgeDir.x * (r + 14), y: center.y + badgeDir.y * (r + 14) };

  const showActiveRing = state === "active" || state === "hover";
  const showErrorRing = state === "error";

  const badgeFilled = state === "active" || state === "selected";

  return (
    <g>
      {showActiveRing && (
        <circle
          cx={center.x}
          cy={center.y}
          r={r + (state === "active" ? 6 : 4)}
          fill="none"
          stroke={state === "active" ? "var(--color-accent-500)" : "var(--color-accent-300)"}
          strokeWidth={state === "active" ? 2 : 1.5}
        />
      )}
      {showErrorRing && (
        <circle
          cx={center.x}
          cy={center.y}
          r={r + 5}
          fill="none"
          stroke="var(--color-danger-500)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}
      <circle cx={center.x} cy={center.y} r={r} fill={FILL[state]} fillOpacity={FILL_OPACITY[state]} stroke="#fff" strokeWidth={2} />
      <line x1={center.x} y1={center.y} x2={tickEnd.x} y2={tickEnd.y} stroke="#fff" strokeWidth={2} />
      <g transform={`translate(${badgeCenter.x}, ${badgeCenter.y})`}>
        <rect
          x={-12}
          y={-9}
          width={24}
          height={18}
          rx={9}
          fill={badgeFilled ? "var(--color-accent-500)" : "#fff"}
          stroke={badgeFilled ? "none" : "var(--color-zinc-200)"}
          strokeWidth={1}
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10.5}
          fontWeight={700}
          fill={badgeFilled ? "#fff" : state === "ghosted" ? "var(--color-zinc-400)" : "var(--color-zinc-700)"}
        >
          {label}
        </text>
      </g>
    </g>
  );
}
