export function normalizeManualUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function tokenLooksLikeUrl(token: string): boolean {
  return (
    /^https?:\/\//i.test(token) ||
    /^www\./i.test(token) ||
    /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|:|\?)/i.test(token)
  );
}

export function parseManualUrlText(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    for (const token of line.split(/[\t,;\s]+/)) {
      const cleaned = token.trim().replace(/^['"]|['"]$/g, "");
      if (!tokenLooksLikeUrl(cleaned)) continue;
      const url = normalizeManualUrl(cleaned);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

export async function parseManualUrlFile(file: File): Promise<string[]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    return parseManualUrlText(
      rows
        .flatMap((row) => row.map((cell) => (cell == null ? "" : String(cell))))
        .join("\n"),
    );
  }

  return parseManualUrlText(await file.text());
}
