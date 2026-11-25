/** RFC 6266 attachment header with an ASCII fallback and an RFC 5987 UTF-8 filename*. */
export function contentDisposition(filename: string, asciiFallback: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
