export type LineDiff = {
  kind: "same" | "add" | "del";
  text: string;
};

export function unifiedLineDiff(left: string, right: string): LineDiff[] {
  const a = left.replace(/\r\n/g, "\n").split("\n");
  const b = right.replace(/\r\n/g, "\n").split("\n");
  const rows: LineDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i]! });
      i += 1;
      j += 1;
      continue;
    }
    if (j < b.length && (i >= a.length || !a.slice(i + 1).includes(b[j]!))) {
      rows.push({ kind: "add", text: b[j]! });
      j += 1;
      continue;
    }
    if (i < a.length) {
      rows.push({ kind: "del", text: a[i]! });
      i += 1;
    }
  }
  return rows;
}

export function prettyMaybeJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
