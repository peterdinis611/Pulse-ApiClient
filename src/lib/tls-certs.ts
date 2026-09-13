import { open } from "@tauri-apps/plugin-dialog";

export async function pickPemFile(label: string): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: label, extensions: ["pem", "crt", "cer", "key"] }],
  });
  if (selected === null) return null;
  return Array.isArray(selected) ? selected[0] ?? null : selected;
}
