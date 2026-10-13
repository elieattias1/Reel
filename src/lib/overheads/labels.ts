/**
 * The next setup letter after `existingLetters`: A, B, ... Z, AA, AB, ...
 * (spreadsheet-column style), per the brief's "lettered 12A, 12B...".
 */
export function nextSetupLetter(existingLetters: string[]): string {
  if (existingLetters.length === 0) return "A";

  let max = 0;
  for (const letter of existingLetters) {
    max = Math.max(max, lettersToIndex(letter));
  }
  return indexToLetters(max + 1);
}

function lettersToIndex(letters: string): number {
  let index = 0;
  for (const ch of letters) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index;
}

function indexToLetters(index: number): string {
  let result = "";
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
