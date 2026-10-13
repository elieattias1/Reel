# Overhead Shots — new tokens

Extends `src/app/globals.css`. These are additions only — nothing here replaces an existing token. Names follow the file's own convention (`--color-*`, `--radius-*`) so they can be dropped into the same `@theme inline` block.

## Character palette

The one place a multi-color palette is allowed. Eight muted, desaturated hues at matched lightness so none reads as more "important" than another. Cameras never use these — cameras are always `--color-accent-500/600`. Identity is carried by the actor mark's initial letter, never by color alone (see `components.md` → ActorMark).

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-character-1` | `#3E6690` | `#7FA8D9` | Actor mark fill, slot 1 (used by Maya in the sample scene) |
| `--color-character-2` | `#5C7A4F` | `#9BBE8A` | Actor mark fill, slot 2 |
| `--color-character-3` | `#92563C` | `#D59A79` | Actor mark fill, slot 3 (used by Theo in the sample scene) |
| `--color-character-4` | `#6E5B96` | `#B2A0D6` | Actor mark fill, slot 4 |
| `--color-character-5` | `#8A7231` | `#C9AF5F` | Actor mark fill, slot 5 |
| `--color-character-6` | `#3F8278` | `#86C2B5` | Actor mark fill, slot 6 |
| `--color-character-7` | `#99465B` | `#D7899A` | Actor mark fill, slot 7 |
| `--color-character-8` | `#5B6672` | `#A3AFBC` | Actor mark fill, slot 8 |

Assignment is by first appearance in the scene (first character to appear gets slot 1), stable for the life of the project so a character's color never changes scene to scene. Beyond 8 characters in one scene, cycle back to slot 1 — flagged as an open question in `DESIGN_HANDOFF.md` (two characters sharing a color in a crowd scene).

All eight hold ≥ 4.5:1 contrast for a white initial set on top of the fill, in both light and dark values, per the system's accessibility commitment.

## Diagram stroke weights

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--stroke-wall` | `4px solid #19191C` | `4px solid #F2F2F4` | Exterior/interior walls — the darkest line on the diagram |
| `--stroke-door-leaf` | `3px solid #19191C` | `3px solid #F2F2F4` | Door leaf |
| `--stroke-door-swing` | `1.25px dashed #A1A1AA` | `1.25px dashed #52525B` | Door swing arc |
| `--stroke-window` | `1.5px solid #71717A` | `1.5px solid #A1A1AA` | The two parallel lines of a window glyph |
| `--stroke-furniture` | `1.5px solid #D4D4D8` | `1.5px solid #3F3F46` | Generic furniture rectangle outline (fill: `--color-zinc-100`/`--color-zinc-800`) |
| `--stroke-axis` | `1.5px dashed #A1A1AA` | `1.5px dashed #52525B` | 180° line |
| `--stroke-dolly-track` | `2px dashed #52525B` | `2px dashed #A1A1AA` | Movement path rail (ties drawn at the same weight) |
| `--stroke-actor-path` | `2px dashed [character color]` | `2px dashed [character color]` | Actor movement path — always the moving actor's own color |

## Field-of-view cone

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--cone-fill-opacity-active` | `0.16` | `0.22` | The on-screen shot's cone fill (over `--color-accent-500`) |
| `--cone-fill-opacity-ghost` | `0.07` | `0.10` | Onion-skinned setups in default view |
| `--cone-stroke-active` | `1px solid #4F5FE8` | `1px solid #6C7FF1` | Active cone outline |
| `--cone-stroke-ghost` | `1px dashed #A1A1AA` | `1px dashed #52525B` | Ghosted cone outline |

## Validation

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--validation-warning-marker` | `#B45309` on `#FFFAEB` | `#FBBF24` on `#3F2D0A` | Warning marker fill/background (reuses `--color-warning-*`) |
| `--validation-error-marker` | `#B91C1C` on `#FEF2F2` | `#F87171` on `#450A0A` | Error marker fill/background (reuses `--color-danger-*`) |

## Motion

| Token | Value | Usage |
|---|---|---|
| `--motion-duration-shot` | `420ms` | Camera/cone/actor tween when switching shots |
| `--motion-ease-shot` | `cubic-bezier(0.4, 0, 0.2, 1)` | Easing for the above — calm deceleration, no overshoot |
| `--motion-duration-reduced` | `0ms` | Applied instead of `--motion-duration-shot` under `prefers-reduced-motion: reduce` — a hard cut, no tween |
| `--motion-duration-spinner` | `1000ms linear infinite` | Generating-state spinner rotation |
