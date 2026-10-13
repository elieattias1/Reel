import type { Character } from "./schema";

const PALETTE_SIZE = 8;

/**
 * Assigns each character a slot from the 8-color character palette
 * (tokens.md), by position in `orderedCharacters` — which the caller must
 * already have ordered by first appearance (e.g. `characters.created_at`,
 * since that's the order the breakdown agent upserted them in, itself
 * following script order). Stable for the life of the project because
 * it's always recomputed the same way from the same ordering, not because
 * the slot is stored anywhere. Beyond 8 characters, cycles back to slot 1
 * (tokens.md's own open question — two characters sharing a color in a
 * crowd scene — is accepted as-is, consistent with the producer's
 * decision that identity rests on the initial letter, not the color).
 *
 * Colors are CSS var references (`var(--color-character-N)`, defined in
 * globals.css for both light and dark) rather than literal hex, so they
 * stay theme-correct without the renderer needing to branch on theme.
 */
export function assignCharacterPalette(orderedCharacters: { id: string; name: string }[]): Character[] {
  return orderedCharacters.map((c, i) => {
    const slot = (i % PALETTE_SIZE) + 1;
    const colorVar = `var(--color-character-${slot})`;
    return {
      id: c.id,
      name: c.name,
      initial: c.name.trim().charAt(0).toUpperCase() || "?",
      color: { light: colorVar, dark: colorVar },
    };
  });
}
