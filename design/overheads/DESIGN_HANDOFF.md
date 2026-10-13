# Overhead Shots workspace — design handoff

An AI-native blocking workspace: the user chats with an agent that drafts top-down camera diagrams shot by shot for a scene, browsing with arrow keys while later shots keep streaming in. Built on the existing Reel kit (`src/app/globals.css`, `src/components/reel/`) — extended, not replaced.

## File index

| File | What it is |
|---|---|
| `tokens.md` | New tokens only: 8-color character palette, diagram stroke weights, cone opacities, motion durations/easing. Follows `globals.css`'s own `--color-*`/`--radius-*` naming. |
| `components.md` | One entry per new component (CameraGlyph, FovCone, DollyTrack, ActorMark, ActorPath, SetWall/Door/Window/Piece, AxisLine, ScaleBar, OrientationMarker, ValidationMarker): purpose, props, variants, states, dimensions, tokens used. Also lists which existing Reel components each screen reuses as-is. |
| `sample-scene.json` | One complete scene — a set, 6 shots (12A–12F), 2 characters, one moving camera (12E, dolly), one moving actor (Maya, 3 beats). Every mockup below renders from this data. |
| `screens/*.html` | Static, open-in-a-browser mockups, pixel-accurate, built from the data above. See list below. |

## Screens

- `screens/default-1440.html` — default workspace view: scene list, overhead diagram, shot detail, shot strip, chat. 12C active, others onion-skinned.
- `screens/default-1024.html` — same view at 1024px: scene list collapses to a dropdown, chat narrows.
- `screens/all-setups-1440.html` — every setup visible at once, the one-page crew overhead, plus a setup list for the sheet.
- `screens/generating-1440.html` — shots streaming in: strip shows Ready / Drafting… / Queued states; the user is browsing an already-ready shot.
- `screens/empty-states-1440.html` — both empty states side by side: no set yet, and set-but-no-shots.
- `screens/edit-mode-1440.html` — dragging a camera: ghost at the origin, a snap guide, the rotate handle, and an inline lens/height/support panel.
- `screens/validation-1440.html` — 4 flagged issues on one diagram (axis crossing, frame overlap, camera inside a set piece, uncovered lines) plus the validation list.
- `screens/approval-1440.html` — the schedule-impact moment: `ApprovalCard` (unchanged component) adapted to "this blocking needs a dolly day."
- `screens/version-history-1440.html` — version list + a non-current version's diagram, with a restore banner.
- `screens/print-scene-12.html` — one Letter-landscape page, all setups + shot list, legible in black and white.
- `screens/symbol-sheet.html` — every diagram symbol, every state, labeled — the reference sheet for section A.

## Keyboard map

| Key | Action |
|---|---|
| ← / → | Previous / next shot. Clamps at 12A and 12F — no wrap to the adjacent scene (open question below). |
| ↑ / ↓ | Previous / next scene. |
| A | Toggle all-setups mode. |
| Space | Play movement paths (camera + actor) for the active shot. |
| E | Enter edit mode on the active setup. |
| / | Focus the chat input. |
| ⌘/Ctrl+Z | Undo the last agent or hand edit. |

## Motion spec

- **Shot transition**: camera, cone, and actor marks tween from the previous shot's positions to the next — `420ms`, `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Reduced motion** (`prefers-reduced-motion: reduce`): hard cut, `0ms` — no tween, no fade.
- **Onion-skinning**: every non-active setup renders at all times in default view — camera at ~55% opacity gray, cone at 7% fill, dashed outline. Never hidden, never requiring a click to reveal.
- **Chat ↔ canvas**: every chat message is sent with the shot currently on screen; the chat header shows a "Viewing 12C"-style chip bound to that shot. When an edit lands, the assistant's bubble is followed by a small green "Updated 12C on canvas" tag — not a re-animation of the whole diagram, just that tag, so the user's eye isn't yanked away from what they were reading.

## Accessibility

- Every status/validation color is paired with an icon and a text line — never color alone (see `ValidationMarker` in `components.md`).
- Character identity is the initial letter, not the color (two character colors can land close in grayscale by design — see open question 3).
- Screen-reader text per shot follows the brief's own example shape: `"Setup 12C, over-the-shoulder on Maya, 50mm, static."`
- All interactive targets ≥ 40×40px, including shot-strip chips and setup badges in edit mode.

## Deviation from the brief

This package was first produced as a Claude "Design canvas" artifact (clickable artboards) because the session that started this work was bound to that artifact type. That canvas is still available on request, but it isn't a substitute for these files — an engineer should work from this directory, not from a claude.ai link.

## Open questions for the producer

1. **FOV cone length** is schematic (fixed ~5ft), not tied to a subject-distance field in the data model. Add a `focusDistanceFt` to `Setup` so cones scale to the actual subject, or keep it schematic?
2. **Arrow keys at the first/last shot** (12A, 12F) — clamp (current assumption), or wrap into the previous/next scene's shot list?
3. **Two characters' colors can read as the same gray in black-and-white print** (identity rests on the initial, by design) — acceptable, or should print mode add a pattern/texture per character as a second cue?
4. **All-setups mode with many setups** — the sample scene shows 6 cones at once comfortably; what's the cap before setups should fade by priority or group, and who decides priority (page order? shot size? manual pin)?
