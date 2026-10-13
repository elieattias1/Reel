export interface OrientationMarkerProps {
  northDeg: number;
  x: number;
  y: number;
}

/** Fixed chrome: where north is, since diagram "up" doesn't always equal it (northDeg 0 = up). Rotates the whole glyph, not the label. components.md → OrientationMarker. */
export function OrientationMarker({ northDeg, x, y }: OrientationMarkerProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={14} fill="var(--background)" stroke="var(--color-foreground)" strokeWidth={1.5} />
      <g transform={`rotate(${northDeg})`}>
        <polygon points="0,-11 4,4 0,2 -4,4" fill="var(--color-foreground)" />
      </g>
      <text y={-18} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--color-foreground)">N</text>
    </g>
  );
}
