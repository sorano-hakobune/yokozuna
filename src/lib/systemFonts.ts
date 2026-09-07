/**
 * System font list for text elements.
 * Tries Tauri command `list_system_fonts` when running inside the shell;
 * falls back to a curated Japanese + Latin set for browser / when the
 * command is not registered yet.
 */

const FALLBACK_FONTS: string[] = [
  "sans-serif",
  "serif",
  "monospace",
  // Japanese
  "Yu Gothic",
  "Yu Mincho",
  "Hiragino Sans",
  "Hiragino Mincho ProN",
  "Hiragino Kaku Gothic ProN",
  "Noto Sans JP",
  "Noto Serif JP",
  "Meiryo",
  "MS Gothic",
  "MS Mincho",
  "MS PGothic",
  "MS PMincho",
  "YuGothic",
  "YuMincho",
  "Osaka",
  // Latin / common
  "Arial",
  "Helvetica",
  "Helvetica Neue",
  "Times New Roman",
  "Times",
  "Georgia",
  "Courier New",
  "Courier",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Palatino Linotype",
  "Book Antiqua",
  "Segoe UI",
  "Roboto",
  "Inter",
];

let cached: string[] | null = null;
let loading: Promise<string[]> | null = null;

function normalizeFontList(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  // Keep generic families at the top for convenience
  const generics = ["sans-serif", "serif", "monospace"];
  const rest = out.filter((f) => !generics.includes(f.toLowerCase()));
  rest.sort((a, b) => a.localeCompare(b, "ja"));
  return [...generics.filter((g) => seen.has(g)), ...rest];
}

/**
 * Returns available font family names.
 * Result is cached for the lifetime of the page.
 */
export async function getSystemFonts(): Promise<string[]> {
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    try {
      // Dynamic import so browser builds without @tauri-apps/api still work
      const { invoke } = await import("@tauri-apps/api/core");
      const list = await invoke<string[]>("list_system_fonts");
      if (Array.isArray(list) && list.length > 0) {
        cached = normalizeFontList(list);
        return cached;
      }
    } catch {
      // Command not registered, or not running under Tauri — use fallback
    }
    cached = normalizeFontList(FALLBACK_FONTS);
    return cached;
  })();

  return loading;
}

/** Synchronous access after first successful load (may be empty before). */
export function getCachedSystemFonts(): string[] {
  return cached ?? FALLBACK_FONTS;
}
