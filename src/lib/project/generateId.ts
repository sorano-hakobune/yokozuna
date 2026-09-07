/**
 * 一意なIDを生成（簡易版）
 * 本格的には nanoid や uuid を使っても良い
 */
export function generateId(prefix = ""): string {
  const id = Math.random().toString(36).substring(2, 10);
  return prefix ? `${prefix}_${id}` : id;
}
