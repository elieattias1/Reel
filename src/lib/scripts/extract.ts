import { XMLParser } from "fast-xml-parser";

/** Extracts raw screenplay text from an uploaded PDF. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Extracts raw screenplay text from a Final Draft (.fdx) file by parsing
 * its XML directly, rather than treating it as a PDF or relying on a
 * brittle screenplay-layout parser. Final Draft XML is a flat sequence of
 * <Paragraph> elements, each carrying a `Type` (Scene Heading, Action,
 * Character, Dialogue, Parenthetical, Transition, …) and one or more
 * <Text> runs.
 */
export function extractFdxText(xml: string): string {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
  });
  const doc = parser.parse(xml);

  const paragraphs = doc?.FinalDraft?.Content?.Paragraph;
  if (!paragraphs) return "";

  const list = Array.isArray(paragraphs) ? paragraphs : [paragraphs];

  const lines: string[] = [];
  for (const p of list) {
    const type = p?.["@_Type"] as string | undefined;
    const text = collectText(p?.Text);
    if (!text) continue;

    // Preserve enough structure (scene headings, character cues, dialogue)
    // for Claude's structured extraction to read scene boundaries reliably,
    // without reimplementing full screenplay layout.
    if (type === "Scene Heading") {
      lines.push(`\n${text.toUpperCase()}`);
    } else if (type === "Character") {
      lines.push(`\n  ${text.toUpperCase()}`);
    } else if (type === "Parenthetical") {
      lines.push(`  (${text})`);
    } else {
      lines.push(text);
    }
  }
  return lines.join("\n");
}

function collectText(textNode: unknown): string {
  if (!textNode) return "";
  const runs = Array.isArray(textNode) ? textNode : [textNode];
  return runs
    .map((r) => (typeof r === "string" ? r : r?.["#text"] ?? ""))
    .join("")
    .trim();
}

export async function extractScriptText(
  buffer: Buffer,
  fileType: "pdf" | "fdx"
): Promise<string> {
  if (fileType === "pdf") return extractPdfText(buffer);
  return extractFdxText(buffer.toString("utf-8"));
}
