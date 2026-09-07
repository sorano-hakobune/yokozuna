/** Shared browser file / download helpers (single implementation). */

export function sanitizeFileName(name: string): string {
  return (name || "export").replace(/[\\/:*?"<>|]+/g, "_").trim() || "export";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function downloadBlob(blob: Blob, fileName: string, revokeAfterMs = 4000): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  // Required for Firefox: element must be in DOM to trigger download.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

export function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}
