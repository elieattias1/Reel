import type { Point2D } from "@/lib/overheads/schema";
import { toPx } from "./scale";

export interface DollyTrackProps {
  points: Point2D[];
  pxPerFt: number;
}

/** A camera movement path with mechanical support — visually distinct from a plain actor path. components.md → DollyTrack. */
export function DollyTrack({ points, pxPerFt }: DollyTrackProps) {
  if (points.length < 2) return null;
  const px = points.map((p) => toPx(p, pxPerFt));

  const ties: { x: number; y: number; angle: number }[] = [];
  const TIE_SPACING_PX = 2.5 * pxPerFt;
  for (let i = 0; i < px.length - 1; i++) {
    const a = px[i];
    const b = px[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const count = Math.max(1, Math.floor(length / TIE_SPACING_PX));
    for (let t = 0; t <= count; t++) {
      const frac = t / count;
      ties.push({ x: a.x + dx * frac, y: a.y + dy * frac, angle });
    }
  }

  const last = px[px.length - 1];
  const secondLast = px[px.length - 2];
  const angle = Math.atan2(last.y - secondLast.y, last.x - secondLast.x);
  const arrowSize = 8;
  const back1 = { x: last.x - arrowSize * Math.cos(angle - Math.PI / 7), y: last.y - arrowSize * Math.sin(angle - Math.PI / 7) };
  const back2 = { x: last.x - arrowSize * Math.cos(angle + Math.PI / 7), y: last.y - arrowSize * Math.sin(angle + Math.PI / 7) };

  return (
    <g>
      {px.slice(0, -1).map((p, i) => (
        <line key={i} x1={p.x} y1={p.y} x2={px[i + 1].x} y2={px[i + 1].y} stroke="var(--color-zinc-600)" strokeWidth={2} strokeDasharray="6 4" />
      ))}
      {ties.map((tie, i) => {
        const tieHalf = 8;
        const perpAngle = tie.angle + Math.PI / 2;
        return (
          <line
            key={i}
            x1={tie.x - tieHalf * Math.cos(perpAngle)}
            y1={tie.y - tieHalf * Math.sin(perpAngle)}
            x2={tie.x + tieHalf * Math.cos(perpAngle)}
            y2={tie.y + tieHalf * Math.sin(perpAngle)}
            stroke="var(--color-zinc-600)"
            strokeWidth={2}
          />
        );
      })}
      <polygon points={`${last.x},${last.y} ${back1.x},${back1.y} ${back2.x},${back2.y}`} fill="var(--color-zinc-600)" />
    </g>
  );
}
