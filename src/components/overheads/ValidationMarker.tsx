import type { ValidationSeverity } from "@/lib/overheads/validators";

export interface ValidationMarkerProps {
  x: number;
  y: number;
  severity: ValidationSeverity;
  message: string;
}

/**
 * Flags a warning or error directly on the diagram, at the element it
 * concerns. Never color alone — always paired with the "!" glyph here and
 * a matching line of text in the validation list. "info" severity has no
 * on-canvas marker (components.md only defines warning/error variants);
 * info issues (uncovered lines) only ever show in the validation list.
 * components.md → ValidationMarker.
 */
export function ValidationMarker({ x, y, severity, message }: ValidationMarkerProps) {
  if (severity === "info") return null;
  const isError = severity === "error";
  const size = isError ? 20 : 18;
  const fill = isError ? "var(--validation-error-marker)" : "var(--validation-warning-marker)";
  const bg = isError ? "var(--validation-error-marker-bg)" : "var(--validation-warning-marker-bg)";

  return (
    <g transform={`translate(${x}, ${y})`}>
      <title>{message}</title>
      {isError ? (
        <circle r={size / 2} fill={bg} stroke={fill} strokeWidth={1.5} />
      ) : (
        <polygon
          points={`0,${-size / 2} ${size / 2},${size / 2} ${-size / 2},${size / 2}`}
          fill={bg}
          stroke={fill}
          strokeWidth={1.5}
        />
      )}
      <text textAnchor="middle" dominantBaseline="central" y={isError ? 0 : 2} fontSize={11} fontWeight={700} fill={fill}>
        !
      </text>
    </g>
  );
}
