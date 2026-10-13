import { extendLineToRect } from "@/lib/overheads/geometry";
import type { Point2D } from "@/lib/overheads/schema";
import { toPx } from "./scale";

export interface AxisLineProps {
  through: [Point2D, Point2D];
  bounds: { width: number; height: number };
  pxPerFt: number;
}

/** The axis of action, extended to the set's walls. A camera crossing it is what the 180° validator flags. components.md → AxisLine. */
export function AxisLine({ through, bounds, pxPerFt }: AxisLineProps) {
  const extended = extendLineToRect(through[0], through[1], { x: 0, y: 0, width: bounds.width, height: bounds.height });
  if (!extended) return null;
  const [a, b] = extended.map((p) => toPx(p, pxPerFt));
  const labelPos = toPx(
    { x: extended[0].x + (extended[1].x - extended[0].x) * 0.15, y: extended[0].y + (extended[1].y - extended[0].y) * 0.15 },
    pxPerFt
  );

  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-zinc-400)" strokeWidth={1.5} strokeDasharray="9 6" />
      <g transform={`translate(${labelPos.x}, ${labelPos.y})`}>
        <rect x={-30} y={-10} width={60} height={20} rx={10} fill="var(--background)" stroke="var(--color-zinc-200)" strokeWidth={1} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600} fill="var(--color-zinc-500)">
          180° line
        </text>
      </g>
    </g>
  );
}
