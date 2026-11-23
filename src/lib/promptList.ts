export interface ParsedPromptList {
  /** Prompts after template expansion. */
  prompts: string[];
  totalLines: number;
  commentLines: number;
  emptyLines: number;
  /** Prompt lines before expansion (variable definitions excluded). */
  templateLines: number;
  /** True when expansion would exceed {@link MAX_EXPANDED_PROMPTS}; `prompts` is then truncated. */
  tooMany: boolean;
}

export const MAX_EXPANDED_PROMPTS = 500;

const VARIABLE_LINE = /^\$([A-Za-z_][\w-]*)\s*=\s*(.+)$/;

function splitOptions(text: string) {
  return text.split("|").map((option) => option.trim()).filter(Boolean);
}

/**
 * Expand prompt templates into every combination.
 * - `{red|blue}` is an inline choice.
 * - A line `$style = oil | pixel art` defines a variable, used as `{style}` in any prompt line.
 * Braces that match neither are left as written. The first group varies slowest.
 */
export function expandPromptTemplates(lines: string[]) {
  const variables = new Map<string, string[]>();
  const templates: string[] = [];
  for (const line of lines) {
    const match = VARIABLE_LINE.exec(line);
    if (match) variables.set(match[1], splitOptions(match[2]));
    else templates.push(line);
  }

  const prompts: string[] = [];
  for (const template of templates) {
    const parts: Array<string | string[]> = [];
    let last = 0;
    template.replace(/\{([^{}]+)\}/g, (matched: string, inner: string, offset: number) => {
      const options = inner.includes("|") ? splitOptions(inner) : variables.get(inner.trim());
      if (!options?.length) return matched;
      parts.push(template.slice(last, offset), options);
      last = offset + matched.length;
      return matched;
    });
    parts.push(template.slice(last));

    const count = parts.reduce((total, part) => (typeof part === "string" ? total : total * part.length), 1);
    if (prompts.length + count > MAX_EXPANDED_PROMPTS) {
      return { prompts, templateLines: templates.length, tooMany: true };
    }

    let combos = [""];
    for (const part of parts) {
      combos = typeof part === "string" ? combos.map((combo) => combo + part) : combos.flatMap((combo) => part.map((option) => combo + option));
    }
    prompts.push(...combos);
  }

  return { prompts, templateLines: templates.length, tooMany: false };
}

/**
 * Parse a textarea full of prompts into a clean string array.
 *
 * Rules:
 * - Split by `\n` (handles `\r\n` too).
 * - Trim each line.
 * - Skip empty lines.
 * - Skip lines whose first non-whitespace char is `#` (comments).
 * - No deduplication — duplicates may be intentional (different seeds).
 */
export function parsePromptList(text: string): ParsedPromptList {
  if (!text) {
    return { prompts: [], totalLines: 0, commentLines: 0, emptyLines: 0, templateLines: 0, tooMany: false };
  }

  const rawLines = text.split(/\r?\n/);
  const lines: string[] = [];
  let commentLines = 0;
  let emptyLines = 0;

  for (const raw of rawLines) {
    const line = raw.trim();
    if (line.length === 0) {
      emptyLines += 1;
      continue;
    }
    if (line.startsWith("#")) {
      commentLines += 1;
      continue;
    }
    lines.push(line);
  }

  return {
    ...expandPromptTemplates(lines),
    totalLines: rawLines.length,
    commentLines,
    emptyLines,
  };
}

/**
 * Build a `batch_YYMMDD_HHmm_<4hex>` id. Time component lets users eyeball
 * which batch is which without consulting metadata.
 */
export function createBatchId(now: Date = new Date()): string {
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const hex = Math.random().toString(16).slice(2, 6).padEnd(4, "0");
  return `batch_${yy}${mm}${dd}_${hh}${min}_${hex}`;
}

/**
 * Read text from an uploaded file (.txt / .md / .csv). For CSV we only take
 * the first column of each row — keeping the parser dumb on purpose.
 */
export async function readPromptListFile(file: File): Promise<string> {
  const text = await file.text();
  const isCsv = /\.csv$/i.test(file.name);
  if (!isCsv) {
    return text;
  }

  return text
    .split(/\r?\n/)
    .map((line) => extractFirstCsvColumn(line))
    .join("\n");
}

function extractFirstCsvColumn(line: string): string {
  if (line.length === 0) {
    return "";
  }
  // Quoted first column: "foo, bar",baz  -> foo, bar
  if (line.startsWith("\"")) {
    let i = 1;
    let out = "";
    while (i < line.length) {
      const c = line[i];
      if (c === "\"") {
        if (line[i + 1] === "\"") {
          out += "\"";
          i += 2;
          continue;
        }
        return out;
      }
      out += c;
      i += 1;
    }
    return out;
  }
  const comma = line.indexOf(",");
  return comma === -1 ? line : line.slice(0, comma);
}

/**
 * Slug a prompt for use as a filename fragment. Keeps ascii letters, digits
 * and underscores; collapses runs; trims to 30 chars.
 */
export function slugifyPrompt(prompt: string, maxLength = 30): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength)
    .replace(/_+$/g, "");
  return slug || "prompt";
}
