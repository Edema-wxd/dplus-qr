/**
 * The Markdown toolbar's edits, as pure functions of the text and the
 * selection, so they are the same whether they come from a button or a
 * shortcut, and easy to reason about.
 */

export type Selection = { start: number; end: number };
export type Edit = { value: string; selection: Selection };

export type Format = "h2" | "h3" | "bold" | "italic" | "link" | "list" | "numbered" | "quote" | "table";

function lineBounds(value: string, selection: Selection): Selection {
  const start = value.lastIndexOf("\n", selection.start - 1) + 1;
  const endBreak = value.indexOf("\n", selection.end);
  return { start, end: endBreak === -1 ? value.length : endBreak };
}

/** Wrap the selection, or a placeholder word when nothing is selected, and select the inside. */
function wrap(value: string, selection: Selection, before: string, after: string, placeholder: string): Edit {
  const selected = value.slice(selection.start, selection.end) || placeholder;
  const next = value.slice(0, selection.start) + before + selected + after + value.slice(selection.end);
  const start = selection.start + before.length;
  return { value: next, selection: { start, end: start + selected.length } };
}

/** Put a marker at the start of every selected line, or take it off if they all have it. */
function prefixLines(value: string, selection: Selection, marker: (index: number) => string, pattern: RegExp): Edit {
  const bounds = lineBounds(value, selection);
  const lines = value.slice(bounds.start, bounds.end).split("\n");
  const allMarked = lines.every((line) => pattern.test(line));
  const changed = lines.map((line, index) =>
    allMarked ? line.replace(pattern, "") : `${marker(index)}${line.replace(/^(#{1,6} |> |- |\d+\. )/, "")}`
  );
  const replacement = changed.join("\n");
  return {
    value: value.slice(0, bounds.start) + replacement + value.slice(bounds.end),
    selection: { start: bounds.start, end: bounds.start + replacement.length },
  };
}

const TABLE = "\n| Column | Column |\n| --- | --- |\n| Value | Value |\n";

export function applyFormat(value: string, selection: Selection, format: Format): Edit {
  switch (format) {
    case "bold":
      return wrap(value, selection, "**", "**", "bold text");
    case "italic":
      return wrap(value, selection, "_", "_", "italic text");
    case "link": {
      const text = value.slice(selection.start, selection.end) || "link text";
      const insert = `[${text}](https://)`;
      const next = value.slice(0, selection.start) + insert + value.slice(selection.end);
      // Select the address, the part that still needs typing.
      const urlStart = selection.start + text.length + 3;
      return { value: next, selection: { start: urlStart, end: urlStart + "https://".length } };
    }
    case "h2":
      return prefixLines(value, selection, () => "## ", /^## /);
    case "h3":
      return prefixLines(value, selection, () => "### ", /^### /);
    case "list":
      return prefixLines(value, selection, () => "- ", /^- /);
    case "numbered":
      return prefixLines(value, selection, (index) => `${index + 1}. `, /^\d+\. /);
    case "quote":
      return prefixLines(value, selection, () => "> ", /^> /);
    case "table": {
      const next = value.slice(0, selection.end) + TABLE + value.slice(selection.end);
      const start = selection.end + TABLE.indexOf("Column");
      return { value: next, selection: { start, end: start + "Column".length } };
    }
  }
}

/** Insert text at the cursor, on a line of its own when it is a block such as an image. */
export function insertBlock(value: string, selection: Selection, block: string): Edit {
  const before = value.slice(0, selection.start);
  const after = value.slice(selection.end);
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after.startsWith("\n") ? "" : "\n";
  const next = before + lead + block + trail + after;
  const start = before.length + lead.length;
  return { value: next, selection: { start, end: start + block.length } };
}
