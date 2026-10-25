export type Frontmatter = { body: string; description: string; order: number; title: string };

/** The three frontmatter keys every page has, read by hand: no yaml parser for three lines. */
export function frontmatter(slug: string, source: string): Frontmatter {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) {
    throw new Error(`docs: ${slug}.md has no frontmatter`);
  }
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
  }
  const title = fields.get('title');
  const description = fields.get('description');
  const order = Number(fields.get('order'));
  if (title === undefined || description === undefined || !Number.isFinite(order)) {
    throw new Error(`docs: ${slug}.md needs title, description and order`);
  }
  return { body: source.slice(match[0].length), description, order, title };
}

/** The heading id rule the content's own links are written against. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(' ', '-')
    .replaceAll(/[^a-z0-9-]/g, '');
}
