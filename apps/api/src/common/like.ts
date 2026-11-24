/** Escapes LIKE/ILIKE wildcards so user input matches literally (use with ESCAPE '\'). */
export function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
