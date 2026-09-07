/** Normalize a CSS color for `<input type="color">` (must be #rrggbb). */
export function toHex6(
  color: string | undefined | null,
  fallback = "#000000",
): string {
  if (!color) return fallback;
  const trimmed = color.trim().toLowerCase();
  if (trimmed === "none" || trimmed === "transparent") return fallback;
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  const short = trimmed.match(/^#([0-9a-f]{3})$/);
  if (short) {
    const [r, g, b] = short[1]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const long = trimmed.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (long) return `#${long[1]}`;
  const rgb = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/,
  );
  if (rgb) {
    return `#${toHex(Number(rgb[1]))}${toHex(Number(rgb[2]))}${toHex(Number(rgb[3]))}`;
  }
  return fallback;
}
