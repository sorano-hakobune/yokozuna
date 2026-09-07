/**
 * App-wide unique ID generation.
 * Prefers crypto.randomUUID when available, falls back to Math.random.
 */
export function generateId(prefix = ""): string {
  let id: string;
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    } else {
      id = Math.random().toString(36).substring(2, 10);
      id += Math.random().toString(36).substring(2, 6);
    }
  } catch {
    id = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
  }
  return prefix ? `${prefix}_${id}` : id;
}
