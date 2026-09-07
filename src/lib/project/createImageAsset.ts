import type { Asset } from "@/types/project";
import { readFileAsDataURL, getExtension } from "@/lib/file-utils";
import { isSvgFile } from "./svgImport";

export type NewImageAsset = Omit<Asset, "id">;

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "avif",
  "svg",
]);

export function getMimeType(fileName: string): string {
  const extension = getExtension(fileName) || "png";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "jpg") return "image/jpeg";
  if (extension === "bmp") return "image/bmp";
  if (extension === "avif") return "image/avif";
  return `image/${extension}`;
}

export function isSupportedImageFile(file: File): boolean {
  if (isSvgFile(file)) return true;
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(getExtension(file.name));
}

function readImageSize(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || 100,
        height: image.naturalHeight || 100,
      });
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = src;
  });
}

/** Read file as data URL. */
export { readFileAsDataURL } from "@/lib/file-utils";

/**
 * Create a library asset from an image or SVG file (always stored as bitmap/svg
 * asset with data URL). For SVG→path conversion, use svgImport helpers instead.
 */
export async function createImageAssetFromFile(
  file: File,
): Promise<NewImageAsset> {
  if (!isSupportedImageFile(file)) {
    throw new Error(`未対応のファイル形式です: ${file.name}`);
  }
  const src = await readFileAsDataURL(file);
  const size = await readImageSize(src).catch(() => ({
    width: 100,
    height: 100,
  }));
  const svg = isSvgFile(file);
  return {
    type: svg ? "svg" : "image",
    name: file.name,
    src,
    ...size,
    mimeType: file.type || getMimeType(file.name),
  };
}
