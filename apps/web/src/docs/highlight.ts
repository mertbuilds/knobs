import { colors } from '@knobs/ui/tokens.stylex';
import { create, props, type StyleXStyles } from '@stylexjs/stylex';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

/**
 * Syntax colors for the docs' code blocks: highlight.js core with only the
 * languages the content uses, run once per block as the pages render.
 */

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);

// Four quiet roles and the muted comment; every other scope stays the text's own color.
const roles = create({
  comment: { color: colors.muted },
  keyword: { color: colors.codeKeyword },
  name: { color: colors.codeName },
  number: { color: colors.codeNumber },
  string: { color: colors.codeString },
});

const byScope: Record<string, StyleXStyles> = {
  attr: roles.name,
  attribute: roles.name,
  built_in: roles.keyword,
  comment: roles.comment,
  keyword: roles.keyword,
  literal: roles.number,
  meta: roles.comment,
  name: roles.keyword,
  number: roles.number,
  regexp: roles.string,
  string: roles.string,
  title: roles.name,
};

/**
 * The code as html with a StyleX class on each colored span, or `undefined`
 * for a fence with no language or one not registered here, which stays plain.
 */
export function highlight(code: string, lang: string | undefined): string | undefined {
  if (lang === undefined || lang === '' || hljs.getLanguage(lang) === undefined) {
    return undefined;
  }
  const { value } = hljs.highlight(code, { ignoreIllegals: true, language: lang });
  return value.replaceAll(/<span class="hljs-([^"]*)">/g, (_, scope: string) => {
    const style = byScope[scope.split(' ')[0] ?? ''];
    const name = style === undefined ? undefined : props(style).className;
    return name === undefined ? '<span>' : `<span class="${name}">`;
  });
}
