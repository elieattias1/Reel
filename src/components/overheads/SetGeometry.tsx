import type { Set as OverheadSet } from "@/lib/overheads/schema";
import { toPx } from "./scale";

export interface SetGeometryProps {
  set: OverheadSet;
  pxPerFt: number;
}

/**
 * Walls, doors, windows, and set pieces — SetWall/SetDoor/SetWindow/
 * SetPiece in components.md are "one rectangle/line component family,
 * re-labeled per instance," so they're one layer here rather than four
 * components. Stroke widths are the literal px values from tokens.md's
 * `--stroke-*` tokens; those tokens are CSS border shorthands (width +
 * style + color bundled), which SVG's separate stroke/strokeWidth/
 * strokeDasharray attributes can't consume directly, so colors are
 * referenced via the underlying `--color-*` vars instead.
 */
export function SetGeometry({ set, pxPerFt }: SetGeometryProps) {
  const center = toPx({ x: set.bounds.width / 2, y: set.bounds.height / 2 }, pxPerFt);

  return (
    <g>
      {set.setPieces.map((piece) => {
        const topLeft = toPx({ x: piece.x, y: piece.y }, pxPerFt);
        return (
          <g key={piece.id}>
            <rect
              x={topLeft.x}
              y={topLeft.y}
              width={piece.width * pxPerFt}
              height={piece.height * pxPerFt}
              fill="var(--color-zinc-100)"
              stroke="var(--color-zinc-300)"
              strokeWidth={1.5}
            />
            <text
              x={topLeft.x + (piece.width * pxPerFt) / 2}
              y={topLeft.y + (piece.height * pxPerFt) / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9.5}
              fontWeight={600}
              letterSpacing="0.04em"
              fill="var(--color-zinc-500)"
            >
              {piece.label.toUpperCase()}
            </text>
          </g>
        );
      })}

      {set.windows.map((w) => {
        const a = toPx({ x: w.x1, y: w.y1 }, pxPerFt);
        const b = toPx({ x: w.x2, y: w.y2 }, pxPerFt);
        return <line key={w.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-zinc-500)" strokeWidth={1.5} />;
      })}

      {set.walls.map((wall) => {
        const a = toPx({ x: wall.x1, y: wall.y1 }, pxPerFt);
        const b = toPx({ x: wall.x2, y: wall.y2 }, pxPerFt);
        return <line key={wall.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-foreground)" strokeWidth={4} />;
      })}

      {set.doors.map((door) => {
        const wall = set.walls.find((w) => w.id === door.wallId);
        if (!wall) return null;

        const dx = wall.x2 - wall.x1;
        const dy = wall.y2 - wall.y1;
        const wallLength = Math.hypot(dx, dy) || 1;
        const wallDir = { x: dx / wallLength, y: dy / wallLength };
        const perpA = { x: -wallDir.y, y: wallDir.x };
        const towardCenterA =
          (center.x / pxPerFt - door.hinge.x) * perpA.x + (center.y / pxPerFt - door.hinge.y) * perpA.y;
        const roomPerp = towardCenterA >= 0 ? perpA : { x: -perpA.x, y: -perpA.y };
        const swingPerp = door.swingsInto === "room" ? roomPerp : { x: -roomPerp.x, y: -roomPerp.y };

        const hingePx = toPx(door.hinge, pxPerFt);
        const closedEnd = toPx({ x: door.hinge.x + wallDir.x * door.width, y: door.hinge.y + wallDir.y * door.width }, pxPerFt);

        const openRad = (door.openAngleDeg * Math.PI) / 180;
        const cos = Math.cos(openRad);
        const sin = Math.sin(openRad);
        const openDir = {
          x: wallDir.x * cos + swingPerp.x * sin,
          y: wallDir.y * cos + swingPerp.y * sin,
        };
        const openEnd = toPx({ x: door.hinge.x + openDir.x * door.width, y: door.hinge.y + openDir.y * door.width }, pxPerFt);

        const widthPx = door.width * pxPerFt;
        const largeArc = door.openAngleDeg > 180 ? 1 : 0;
        const sweep = swingPerp.x * wallDir.y - swingPerp.y * wallDir.x > 0 ? 1 : 0;

        return (
          <g key={door.id}>
            <line x1={closedEnd.x} y1={closedEnd.y} x2={hingePx.x} y2={hingePx.y} stroke="var(--background)" strokeWidth={5} />
            <line x1={hingePx.x} y1={hingePx.y} x2={openEnd.x} y2={openEnd.y} stroke="var(--color-foreground)" strokeWidth={3} />
            <path
              d={`M ${closedEnd.x} ${closedEnd.y} A ${widthPx} ${widthPx} 0 ${largeArc} ${sweep} ${openEnd.x} ${openEnd.y}`}
              fill="none"
              stroke="var(--color-zinc-400)"
              strokeWidth={1.25}
              strokeDasharray="4 4"
            />
          </g>
        );
      })}
    </g>
  );
}
