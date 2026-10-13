import type { Character, Set as OverheadSet, Shot } from "@/lib/overheads/schema";
import { axisFromActors } from "@/lib/overheads/validators";
import type { ValidationIssue } from "@/lib/overheads/validators";
import { ActorMark } from "./ActorMark";
import { ActorPath } from "./ActorPath";
import { AxisLine } from "./AxisLine";
import { CameraGlyph } from "./CameraGlyph";
import { DollyTrack } from "./DollyTrack";
import { FovCone } from "./FovCone";
import { OrientationMarker } from "./OrientationMarker";
import { ScaleBar } from "./ScaleBar";
import { SetGeometry } from "./SetGeometry";
import { ValidationMarker } from "./ValidationMarker";

export interface ActiveOverride {
  camera: { x: number; y: number; headingDeg: number };
  actors: { characterId: string; x: number; y: number }[];
}

export interface OverheadCanvasProps {
  set: OverheadSet;
  shots: Shot[];
  characters: Character[];
  activeShotId: string;
  allSetupsMode: boolean;
  sensorWidthMm: number;
  issues?: ValidationIssue[];
  activeOverride?: ActiveOverride;
  northDeg?: number;
  width?: number;
  height?: number;
}

const CHROME_MARGIN = 56;

/**
 * Composes every Overhead Shots diagram component for one scene view:
 * the set's geometry, the 180° axis (derived from the first shot with at
 * least two actors — components.md doesn't pin down which shot
 * "establishes" the axis beyond "the scene's primary coverage," so this
 * is a documented heuristic, not a spec value), every setup's cone and
 * camera glyph (active/ghosted per mode), the active shot's actors, and
 * fixed chrome (scale bar, orientation marker, validation markers).
 */
export function OverheadCanvas({
  set,
  shots,
  characters,
  activeShotId,
  allSetupsMode,
  sensorWidthMm,
  issues = [],
  activeOverride,
  northDeg = 0,
  width = 760,
  height = 420,
}: OverheadCanvasProps) {
  const pxPerFt = Math.min(width / set.bounds.width, height / set.bounds.height);
  const svgWidth = set.bounds.width * pxPerFt + CHROME_MARGIN * 2;
  const svgHeight = set.bounds.height * pxPerFt + CHROME_MARGIN * 2;

  const colorByCharacterId = new Map(characters.map((c) => [c.id, c.color.light]));
  const initialByCharacterId = new Map(characters.map((c) => [c.id, c.initial]));

  const primaryShot = shots.find((s) => s.actors.length >= 2);
  const axis = primaryShot ? axisFromActors(primaryShot.actors) : null;

  const shotsToDrawActorsFor = allSetupsMode ? shots : shots.filter((s) => s.id === activeShotId);

  return (
    <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ overflow: "visible" }}>
      <g transform={`translate(${CHROME_MARGIN}, ${CHROME_MARGIN})`}>
        <SetGeometry set={set} pxPerFt={pxPerFt} />

        {axis && <AxisLine through={axis.through} bounds={set.bounds} pxPerFt={pxPerFt} />}

        {shots.map((shot) => {
          const isActive = shot.id === activeShotId;
          const state = allSetupsMode ? "active" : isActive ? "active" : "ghosted";
          const camera =
            isActive && activeOverride ? { ...shot.setup, ...activeOverride.camera } : shot.setup;

          return (
            <g key={shot.id}>
              <FovCone
                x={camera.x}
                y={camera.y}
                headingDeg={camera.headingDeg}
                lensMm={camera.lensMm}
                sensorWidthMm={sensorWidthMm}
                focusDistanceFt={camera.focusDistanceFt}
                state={state}
                pxPerFt={pxPerFt}
              />
              {camera.movementPath && (isActive || allSetupsMode) && (
                <DollyTrack points={camera.movementPath.points} pxPerFt={pxPerFt} />
              )}
              <CameraGlyph
                x={camera.x}
                y={camera.y}
                headingDeg={camera.headingDeg}
                label={shot.label}
                state={state}
                pxPerFt={pxPerFt}
              />
            </g>
          );
        })}

        {shotsToDrawActorsFor.map((shot) =>
          shot.actors.map((actor) => {
            const isActiveActor = shot.id === activeShotId;
            const overrideActor =
              isActiveActor && activeOverride
                ? activeOverride.actors.find((a) => a.characterId === actor.characterId)
                : undefined;
            const position = overrideActor ?? actor;
            const color = colorByCharacterId.get(actor.characterId) ?? "var(--color-zinc-500)";
            const initial = initialByCharacterId.get(actor.characterId) ?? "?";

            return (
              <g key={`${shot.id}-${actor.characterId}`}>
                {actor.path && isActiveActor && <ActorPath points={actor.path} color={color} pxPerFt={pxPerFt} />}
                <ActorMark x={position.x} y={position.y} initial={initial} color={color} pxPerFt={pxPerFt} />
              </g>
            );
          })
        )}

        {issues
          .filter((issue) => issue.x !== undefined && issue.y !== undefined)
          .map((issue, i) => {
            const pos = { x: issue.x! * pxPerFt, y: issue.y! * pxPerFt };
            return <ValidationMarker key={i} x={pos.x} y={pos.y} severity={issue.severity} message={issue.message} />;
          })}

        <ScaleBar lengthFt={10} pxPerFt={pxPerFt} x={0} y={set.bounds.height * pxPerFt + 32} />
        <OrientationMarker northDeg={northDeg} x={set.bounds.width * pxPerFt + 24} y={10} />
      </g>
    </svg>
  );
}
