export interface DuplicateIdGroup {
  id: string;
  elements: Element[];
}

/** Shared by A9 (a11y) and S6 (standards) — spec: one detection, two issues. */
export function findDuplicateIds(doc: Document): DuplicateIdGroup[] {
  const seen = new Map<string, Element[]>();
  for (const el of Array.from(doc.querySelectorAll("[id]"))) {
    const id = el.getAttribute("id");
    if (!id) continue;
    const list = seen.get(id) ?? [];
    list.push(el);
    seen.set(id, list);
  }
  return Array.from(seen.entries())
    .filter(([, elements]) => elements.length > 1)
    .map(([id, elements]) => ({ id, elements }));
}
