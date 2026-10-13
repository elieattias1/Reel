import type { Point2D } from "@/lib/overheads/schema";

/** Converts a point in feet to pixels at the canvas's chosen scale. Glyph dimensions (radii, stroke widths) stay literal px — only positions scale. */
export function toPx(point: Point2D, pxPerFt: number): Point2D {
  return { x: point.x * pxPerFt, y: point.y * pxPerFt };
}

export function pointsAttr(points: Point2D[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
