export function downloadJson(content: string, filename: string) {
  downloadBlob(createDownloadBlob(content, "application/json"), filename);
}

export function createDownloadBlob(data: BlobPart, mimeType: string): Blob {
  return new Blob([data], { type: mimeType });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadBytes(bytes: Uint8Array, mimeType: string, filename: string) {
  // Copy into a plain ArrayBuffer-backed Uint8Array for BlobPart typing.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(createDownloadBlob(copy, mimeType), filename);
}

export function collectionExportFilename(name: string, suffix: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "collection";
  return `${slug}.${suffix}`;
}
