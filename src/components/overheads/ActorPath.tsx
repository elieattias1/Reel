import { roundFloat } from "@/lib/overheads/geometry";
import type { ActorBeat } from "@/lib/overheads/schema";
import { toPx } from "./scale";

export interface ActorPathProps {
  points: ActorBeat[];
  color: string;
  pxPerFt: number;
}

/**
 * An actor's movement across the scene, with numbered beats where blocking
 * calls for a stop. The final beat is rendered as a full ActorMark by the
 * caller, not here — this draws the dashed trail, the intermediate beat
 * rings, and the arrowhead leading into that final mark.
 * components.md → ActorPath.
 */
export function ActorPath({ points, color, pxPerFt }: ActorPathProps) {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.beat - b.beat);
  const px = sorted.map((p) => toPx(p, pxPerFt));
  const last = px[px.length - 1];
  const secondLast = px[px.length - 2];
  const angle = Math.atan2(last.y - secondLast.y, last.x - secondLast.x);
  const arrowSize = 7;
  const tip = last;
  const back1 = {
    x: roundFloat(tip.x - arrowSize * Math.cos(angle - Math.PI / 7)),
    y: roundFloat(tip.y - arrowSize * Math.sin(angle - Math.PI / 7)),
  };
  const back2 = {
    x: roundFloat(tip.x - arrowSize * Math.cos(angle + Math.PI / 7)),
    y: roundFloat(tip.y - arrowSize * Math.sin(angle + Math.PI / 7)),
  };

  return (
    <g>
      {px.slice(0, -1).map((p, i) => (
        <line
          key={i}
          x1={p.x}
          y1={p.y}
          x2={px[i + 1].x}
          y2={px[i + 1].y}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="1 5"
          strokeLinecap="round"
        />
      ))}
      <polygon points={`${tip.x},${tip.y} ${back1.x},${back1.y} ${back2.x},${back2.y}`} fill={color} />
      {sorted.slice(0, -1).map((beat, i) => (
        <g key={beat.beat}>
          <circle cx={px[i].x} cy={px[i].y} r={6} fill="#fff" stroke={color} strokeWidth={2} />
          <text textAnchor="middle" dominantBaseline="central" x={px[i].x} y={px[i].y + 0.5} fontSize={8} fontWeight={700} fill={color}>
            {beat.beat}
          </text>
        </g>
      ))}
    </g>
  );
}
