/** A question and its answer from a post's frontmatter, the answer as markdown. */
export type FaqItem = { a: string; q: string };

export type PostFrontmatter = {
  body: string;
  /** The day the post was published, `YYYY-MM-DD`. */
  date: string;
  description: string;
  faq: Array<FaqItem>;
  slug: string;
  title: string;
  /** The day the post's content last changed, `YYYY-MM-DD`. */
  updated: string;
};

/** A quoted yaml scalar as its text: double quotes as JSON, single quotes stripped. */
function scalar(file: string, value: string): string {
  if (value.startsWith('>') || value.startsWith('|')) {
    throw new Error(`blog: ${file}.md uses a block scalar; write each value on one line`);
  }
  if (value.startsWith('"')) {
    return JSON.parse(value) as string;
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

const isDay = (value: string | undefined): value is string =>
  value !== undefined &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

/**
 * A blog post's frontmatter, read by hand like the docs': the top level
 * `key: value` lines, and the `faq` list of `- q:` and `a:` pairs. Other lists
 * (keywords, sources) are the writer's notes and are skipped. Throws on a
 * missing key, a bad day or a slug that is not the file's name, so
 * `scripts/docs-check.ts` fails the build instead of the Worker.
 */
export function postFrontmatter(file: string, source: string): PostFrontmatter {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) {
    throw new Error(`blog: ${file}.md has no frontmatter`);
  }
  const fields = new Map<string, string>();
  const faq: Array<FaqItem> = [];
  let list = '';
  for (const line of (match[1] ?? '').split('\n')) {
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top !== null) {
      list = top[2] === '' ? (top[1] ?? '') : '';
      if (top[2] !== '') {
        fields.set(top[1] ?? '', scalar(file, top[2] ?? ''));
      }
      continue;
    }
    if (list !== 'faq') {
      if (list === '' && line.trim() !== '') {
        throw new Error(`blog: ${file}.md has a line it cannot read: ${line}`);
      }
      continue;
    }
    const item = /^\s+(- )?([qa]):\s*(.+)$/.exec(line);
    if (item === null) {
      if (line.trim() !== '') {
        throw new Error(`blog: ${file}.md has an faq line it cannot read: ${line}`);
      }
      continue;
    }
    const text = scalar(file, item[3] ?? '');
    if (item[2] === 'q') {
      faq.push({ a: '', q: text });
    } else {
      const last = faq.at(-1);
      if (last === undefined) {
        throw new Error(`blog: ${file}.md has an faq answer with no question`);
      }
      last.a = text;
    }
  }
  const title = fields.get('title');
  const description = fields.get('description');
  const slug = fields.get('slug');
  const date = fields.get('date');
  const updated = fields.get('updated');
  if (!title || !description || !slug) {
    throw new Error(`blog: ${file}.md needs title, description and slug`);
  }
  if (slug !== file) {
    throw new Error(`blog: ${file}.md has slug ${slug}, needs the file's name`);
  }
  if (!isDay(date) || !isDay(updated)) {
    throw new Error(`blog: ${file}.md needs date and updated: YYYY-MM-DD, real days`);
  }
  if (faq.some((item) => item.a === '' || item.q === '')) {
    throw new Error(`blog: ${file}.md has an faq question with no answer`);
  }
  return { body: source.slice(match[0].length), date, description, faq, slug, title, updated };
}
