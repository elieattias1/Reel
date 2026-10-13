export interface ScaleBarProps {
  lengthFt: number;
  pxPerFt: number;
  x: number;
  y: number;
}

/** Printable legibility chrome: scale without a legend elsewhere on the page. Fixed position, not per-setup. components.md → ScaleBar. */
export function ScaleBar({ lengthFt, pxPerFt, x, y }: ScaleBarProps) {
  const widthPx = lengthFt * pxPerFt;
  const half = widthPx / 2;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <line x1={0} y1={0} x2={widthPx} y2={0} stroke="var(--color-zinc-600)" strokeWidth={1.5} />
      {[0, half, widthPx].map((tickX) => (
        <line key={tickX} x1={tickX} y1={-5} x2={tickX} y2={5} stroke="var(--color-zinc-600)" strokeWidth={1.5} />
      ))}
      <text x={0} y={18} textAnchor="middle" fontSize={9.5} fill="var(--color-zinc-500)">0</text>
      <text x={half} y={18} textAnchor="middle" fontSize={9.5} fill="var(--color-zinc-500)">{lengthFt / 2} ft</text>
      <text x={widthPx} y={18} textAnchor="middle" fontSize={9.5} fill="var(--color-zinc-500)">{lengthFt} ft</text>
    </g>
  );
}
