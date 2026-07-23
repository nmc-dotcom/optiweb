/** Shared DOM readers used by multiple SEO rules and by crawlEngine (for SiteIndex population). */

export function getTitleText(doc: Document): string | null {
  const text = doc.querySelector("title")?.textContent?.trim();
  return text && text.length > 0 ? text : null;
}

export function getMetaDescription(doc: Document): string | null {
  const content = doc
    .querySelector('meta[name="description" i]')
    ?.getAttribute("content")
    ?.trim();
  return content && content.length > 0 ? content : null;
}
