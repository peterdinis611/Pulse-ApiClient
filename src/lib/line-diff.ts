import { invoke } from "@tauri-apps/api/core";
import { canUseTauriIpc } from "./tauri-runtime";

export type LineDiff = {
  kind: "same" | "add" | "del";
  text: string;
};

function requireTauri(): void {
  if (!canUseTauriIpc()) {
    throw new Error("Line diff requires the desktop app");
  }
}

/** Unified line diff via pulse-core (`unified_lines`). */
export async function unifiedLineDiff(left: string, right: string): Promise<LineDiff[]> {
  requireTauri();
  const rows = await invoke<Array<{ kind: string; text: string }>>("unified_lines", { left, right });
  return rows.map((row) => ({
    kind: (row.kind === "add" || row.kind === "del" ? row.kind : "same") as LineDiff["kind"],
    text: row.text,
  }));
}

/** Pretty-print JSON when possible via pulse-core (`pretty_any`). */
export async function prettyMaybeJson(raw: string): Promise<string> {
  requireTauri();
  return invoke<string>("pretty_any", { raw });
}
