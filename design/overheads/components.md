# Overhead Shots — new components

Each renders as SVG (or SVG + absolutely-positioned text) from the data model in `sample-scene.json`, never a drawn image. Coordinates below are in the set's own feet, converted to px by a single `pxPerFt` scale the canvas owns (see `CameraGlyph`'s Dimensions — everything else scales off it).

---

## CameraGlyph

**Purpose.** One camera setup: position, heading, identity, and a lens/support/height readout. The only element on the diagram that uses the accent color.

**Props.** `{ x, y, headingDeg, label, lensMm, height, support, state }`

**Variants.** None — one glyph, styled entirely by `state`.

**States.**
| State | Fill | Ring | Badge |
|---|---|---|---|
| `default` | `--color-accent-600` | none | white bg, border `--color-zinc-200`, text `--color-zinc-700` |
| `active` | `--color-accent-500` | 2px `--color-accent-500` at r+6 | filled `--color-accent-500`, white text, bold |
| `ghosted` | `--color-zinc-400` @ 55% opacity | none | outline `--color-zinc-300`, text `--color-zinc-400` |
| `hover` | `--color-accent-500` | 1.5px `--color-accent-300` at r+4 | as default |
| `selected` (edit mode) | `--color-accent-600` | 1.5px dashed `--color-accent-500` at r+7, + 8×8px rotate handle at heading − 90° | as active, border `--color-accent-500` |
| `dragging` | `--color-accent-500` @ 70% opacity | ghost outline (dashed `--color-zinc-300`) left at the pre-drag position | as default, follows pointer |
| `warning` | `--color-warning-500` | none | unchanged; a `ValidationMarker` sits at heading − 45°, r+10 |
| `error` | `--color-danger-500` | 1.5px dashed `--color-danger-500` at r+5 | unchanged; a `ValidationMarker` sits at heading − 45°, r+12 |

**Dimensions.** Circle r = 12px default / 13px active / 9–11px ghosted, at the canvas's base scale (35px/ft in the sample — same scale `OverheadCanvas` uses for everything else, so a setup's radius is roughly 0.35ft on the ground, consistent with a real camera + operator footprint). Heading tick: 2px white line, length 14px (11px ghosted), from center toward `headingDeg`. Letter badge: 16–18px tall pill, positioned opposite `headingDeg` (so it never sits inside the cone), horizontal text, never rotated.

**Tokens.** `--color-accent-500/600`, `--color-zinc-300/400`, `--color-warning-500`, `--color-danger-500`.

---

## FovCone

**Purpose.** The camera's horizontal field of view, geometrically real.

**Props.** `{ apex: {x,y}, headingDeg, lensMm, sensorWidthMm, lengthFt, state }`

**Geometry (binding, not a style choice).** `hfovDeg = 2 × atan(sensorWidthMm / (2 × lensMm))`, Super 35 `sensorWidthMm = 24.9` by default. Draw as a 3-point polygon: apex, and two far points at `apex + length × (sin(headingDeg ∓ hfovDeg/2), −cos(headingDeg ∓ hfovDeg/2))`. `lengthFt` is schematic (not tied to subject distance in this version — see `DESIGN_HANDOFF.md` open questions).

**States.** `active` — fill `--color-accent-500` @ `--cone-fill-opacity-active`, stroke `--cone-stroke-active`. `ghosted` — fill `--color-zinc-400` @ `--cone-fill-opacity-ghost`, stroke `--cone-stroke-ghost`. `warning`/`error` — fill/stroke swap to the matching validation color at the same opacity as `active`.

**Dimensions.** `lengthFt` default 5ft at the sample scale; no minimum/maximum enforced, but a cone is never clipped at the set boundary — it's expected to run past walls on a wide lens, which is normal in this symbol language (crew read the angle, not where it stops).

**Tokens.** `--cone-fill-opacity-active/ghost`, `--cone-stroke-active/ghost`.

---

## DollyTrack

**Purpose.** A camera movement path with mechanical support (dolly, crane track) — visually distinct from a plain actor path so crew can tell "camera moves on gear" from "actor walks."

**Props.** `{ points: [{x,y}, ...], distanceFt }`

**Variants.** Straight (2 points, the only one in the sample scene) and multi-point (poly-line, same tie spacing along each segment).

**States.** `active` (full opacity, drawn under the active cone) / `ghosted` (same as other ghosted elements).

**Dimensions.** Rail: 2px dashed line. Perpendicular ties every ~2.5ft along the rail, 2px, 16px tall. Arrowhead at the final point, 16×16px, filled.

**Tokens.** `--stroke-dolly-track`.

---

## ActorMark

**Purpose.** One actor's position at the moment of this shot. Identity is carried by the initial, never by color alone.

**Props.** `{ x, y, characterId, initial, color, facingDeg }`

**States.** `default` (static mark) / `active-shot` (slightly larger, used for the shot's framed subject — optional emphasis, not required) / `selected` (edit mode: dashed ring, draggable).

**Dimensions.** Circle r = 12px (15px in the symbol-sheet reference, where it stands alone), 2px white ring, initial centered, 11px bold.

**Tokens.** `--color-character-1` … `-8`.

---

## ActorPath

**Purpose.** An actor's movement across the scene, with numbered beats where blocking calls for a stop.

**Props.** `{ characterId, points: [{beat, x, y}, ...] }`

**Dimensions.** 2px dashed line in the character's color, arrowhead (12×12px) at the final point. Each intermediate beat: a small 6–7px ring in the character's color with the beat number (8–9px bold) inside; the final beat is a full `ActorMark`, not a small ring.

**Tokens.** The owning character's `--color-character-*`.

---

## Set pieces — SetWall, SetDoor, SetWindow, SetPiece

One rectangle/line component family, re-labeled per instance — not four separate components in code, but four distinct visual treatments worth naming separately here since crews read them as different things on sight.

| | Purpose | Rendering | Tokens |
|---|---|---|---|
| **SetWall** | A wall segment | `--stroke-wall`, drawn as a line, never a filled rect (so wall thickness reads as structure, not as a room) | `--stroke-wall` |
| **SetDoor** | An opening with a leaf and swing | Wall line gapped at `width`; leaf drawn solid from the hinge to the open position; swing arc (`--stroke-door-swing`) sweeps from the closed to the open position, radius = `width` | `--stroke-door-leaf`, `--stroke-door-swing` |
| **SetWindow** | An opening with no clearance needed | Wall line NOT gapped — instead, a white-filled rect masks a short span and two parallel thin lines (`--stroke-window`) are drawn across it | `--stroke-window` |
| **SetPiece** | Generic furniture (table, counter, fridge, bed, car) | Filled rect, `--color-zinc-100`/`--stroke-furniture` outline, uppercase label centered, 9–10px, `--color-zinc-500` | `--stroke-furniture` |

**Props (SetPiece).** `{ x, y, width, height, label }` — one component, re-labeled per instance (`label: "Counter"`, `"Table"`, `"Fridge"`, …), never a bespoke shape per furniture type. An L-shaped piece (the kitchen counter in the sample) is two `SetPiece` instances placed to overlap, not a new polygon type.

---

## AxisLine (180° line)

**Purpose.** The axis of action — drawn through the two actors' eyeline in a scene's primary coverage, extended to the set's walls. A camera that crosses it is what `ValidationMarker` flags.

**Props.** `{ throughPoints: [{x,y},{x,y}], extendTo: "walls" }`

**Dimensions.** 1.5px dashed line, label pill ("180° line") near one end, always horizontal text regardless of the line's own angle.

**Tokens.** `--stroke-axis`.

---

## ScaleBar / OrientationMarker

**Purpose.** Printable legibility — crew need scale and north without a legend elsewhere on the page.

**ScaleBar props.** `{ lengthFt, pxPerFt }` → draws 3 ticks (0 / half / full) with foot labels. **OrientationMarker props.** `{ northDeg }` (0 = diagram "up" is set north; rotates the whole glyph, not the label). Both are fixed-position chrome on `OverheadCanvas`, not per-setup.

**Dimensions.** Scale bar ~120–200px. Compass circle r = 14–18px, 1.5px `--color-zinc-900`/`-50` stroke.

---

## ValidationMarker

**Purpose.** Flags a warning or error directly on the diagram, at the element it concerns — never color alone: every marker carries a glyph (`!`) and a paired line of text in the validation list.

**Props.** `{ x, y, severity: "warning" | "error", message }`

**Variants.** `warning` — small triangle, `--validation-warning-marker` colors. `error` — small circle, `--validation-error-marker` colors, slightly larger.

**Dimensions.** 16–20px marker, offset from its subject so it never overlaps the camera glyph's own badge.

---

## Screen-level reuse of existing Reel components

No new chat, button, badge, or empty-state component was built — the workspace reuses what's in `src/components/reel/` as-is:

- **ChatBubble** — unchanged, used verbatim in the chat sidebar on every screen that shows one.
- **ApprovalCard** — unchanged, used verbatim for the schedule-impact moment (`border-2 border-accent-300 bg-accent-50/40`, `shadow-md`, Approve/Reject via `Button`).
- **Button** — all toolbar/action buttons (`outline`, `ghost`, `success`, `primary` variants as already defined).
- **EmptyState** — both empty-state screens, unchanged.
- **Panel / PanelHeader / PanelBody** — the scene list, setup list, and validation list panels.
- **ConfidenceBadge/StatusIndicator pill pattern** — reused (not the components themselves, which are domain-specific to budget/cast) for the shot-strip "Ready / Drafting… / Queued" pills and the validation list's severity rows, matching their shape (`rounded-full`, icon + label, one fixed vocabulary) rather than inventing a new pill style.
