import { toPx } from "./scale";

export type ActorMarkState = "default" | "active-shot" | "selected";

export interface ActorMarkProps {
  x: number;
  y: number;
  initial: string;
  color: string;
  state?: ActorMarkState;
  pxPerFt: number;
}

/** One actor's position at the moment of this shot. Identity is the initial letter, never color alone. components.md → ActorMark. */
export function ActorMark({ x, y, initial, color, state = "default", pxPerFt }: ActorMarkProps) {
  const center = toPx({ x, y }, pxPerFt);
  const r = state === "active-shot" ? 14 : 12;

  return (
    <g>
      {state === "selected" && (
        <circle cx={center.x} cy={center.y} r={r + 4} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 3" />
      )}
      <circle cx={center.x} cy={center.y} r={r} fill={color} stroke="#fff" strokeWidth={2} />
      <text textAnchor="middle" dominantBaseline="central" x={center.x} y={center.y + 1} fontSize={11} fontWeight={700} fill="#fff">
        {initial}
      </text>
    </g>
  );
}
