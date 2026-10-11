import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backgroundOf, normalizeColor, readLook, scanLook } from './look.ts';

function look(html: string) {
  return scanLook(html).look;
}

test('colours: hex in its four lengths, in any case', () => {
  assert.equal(normalizeColor('#fff'), '#ffffff');
  assert.equal(normalizeColor('#0A0'), '#00aa00');
  assert.equal(normalizeColor(' #1E2327 '), '#1e2327');
  assert.equal(normalizeColor('#f008'), '#ff000088');
  assert.equal(normalizeColor('#11223380'), '#11223380');
  assert.equal(normalizeColor('#ffff'), '#ffffff');
  assert.equal(normalizeColor('#112233FF'), '#112233');
});

test('colours: rgb with numbers, percentages and an alpha', () => {
  assert.equal(normalizeColor('rgb(255, 255, 255)'), '#ffffff');
  assert.equal(normalizeColor('RGB(10,20,30)'), '#0a141e');
  assert.equal(normalizeColor('rgb(100%, 0%, 50%)'), '#ff0080');
  assert.equal(normalizeColor('rgb(300, -5, 12.6)'), '#ff000d');
  assert.equal(normalizeColor('rgba(0, 0, 0, 0.5)'), '#00000080');
  assert.equal(normalizeColor('rgba(0, 0, 0, 50%)'), '#00000080');
  assert.equal(normalizeColor('rgba(17, 17, 17, 1)'), '#111111');
  assert.equal(normalizeColor('rgb(17 17 17)'), '#111111');
  assert.equal(normalizeColor('rgb(17 17 17 / .25)'), '#11111140');
  assert.equal(normalizeColor('rgb( 17  17  17 / 100% )'), '#111111');
});

test('colours: hsl with a hue in degrees', () => {
  assert.equal(normalizeColor('hsl(0, 100%, 50%)'), '#ff0000');
  assert.equal(normalizeColor('hsl(120deg 100% 25%)'), '#008000');
  assert.equal(normalizeColor('hsl(240 100% 50%)'), '#0000ff');
  assert.equal(normalizeColor('hsl(-120, 100%, 50%)'), '#0000ff');
  assert.equal(normalizeColor('hsl(210, 50%, 40%)'), '#336699');
  assert.equal(normalizeColor('hsl(0 0% 100%)'), '#ffffff');
  assert.equal(normalizeColor('hsl(0 0% 7%)'), '#121212');
  assert.equal(normalizeColor('hsla(0, 0%, 0%, 0.5)'), '#00000080');
  assert.equal(normalizeColor('hsl(0.5turn 100% 50%)'), null);
});

test('colours: a few names', () => {
  assert.equal(normalizeColor('white'), '#ffffff');
  assert.equal(normalizeColor('Black'), '#000000');
  assert.equal(normalizeColor('grey'), '#808080');
});

test('colours: all else is none', () => {
  for (const value of [
    '',
    'var(--bg)',
    'rgb(var(--r), 0, 0)',
    'linear-gradient(#fff, #000)',
    'transparent',
    'currentcolor',
    'Canvas',
    'constructor',
    'toString',
    '#ff',
    '#fffff',
    '#ggg',
    'fff',
    'rgb(1, 2)',
    'rgb(1, 2, 3, 4, 5)',
    'rgb(1 2 3 / 4 / 5)',
    'rgb(a, b, c)',
    'rgb(1, 2, 3',
    'rgb(none none none)',
    'oklch(60% 0.1 200)',
    'color-mix(in srgb, #fff, #000)',
    '#fff; background: url(x)',
    `#${'f'.repeat(80)}`,
  ]) {
    assert.equal(normalizeColor(value), null, value);
  }
});

test('an inline style: the last background decides', () => {
  assert.equal(backgroundOf('background-color: #fff'), '#ffffff');
  assert.equal(backgroundOf('color:red;BACKGROUND:#000 !important;margin:0'), '#000000');
  assert.equal(backgroundOf('background-color: #fff; background-color: rgb(1, 2, 3);'), '#010203');
  assert.equal(backgroundOf('background: #fff; background: var(--bg)'), null);
  assert.equal(backgroundOf('background: #fff url(data:image/png;base64,AAAA) no-repeat'), null);
  assert.equal(backgroundOf('background-image: url(a;b); background-color: black'), '#000000');
  assert.equal(backgroundOf('background: linear-gradient(#fff, #000)'), null);
  assert.equal(backgroundOf('background-color: transparent'), null);
  assert.equal(backgroundOf('background-color: rgba(0, 0, 0, 0)'), null);
  assert.equal(backgroundOf('color: #fff'), null);
  assert.equal(backgroundOf(undefined), null);
});

test('a page with one theme colour gives it to both schemes', () => {
  // GitHub's head, cut down.
  const github = `<!DOCTYPE html>
<html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
  <head>
    <meta charset="utf-8">
    <link rel="dns-prefetch" href="https://github.githubassets.com">
    <script crossorigin="anonymous" type="application/javascript" src="https://github.githubassets.com/assets/wp-runtime.js" defer="defer"></script>
    <title>GitHub · Build and ship software on a single, collaborative platform · GitHub</title>
    <meta name="theme-color" content="#1e2327">
    <meta name="color-scheme" content="light dark" />
  </head>
  <body class="logged-out env-production page-responsive" style="word-wrap: break-word;">`;
  assert.deepEqual(scanLook(github), {
    done: true,
    look: { dark: '#1e2327', light: '#1e2327' },
  });
});

test('a page with a theme colour for each scheme', () => {
  // What a Next.js site writes for `themeColor` with two media.
  const next = `<!DOCTYPE html><html lang="en" class="__variable_e8ce0c"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/css/1c2e6b0b.css" data-precedence="next"/><script src="/_next/static/chunks/webpack.js" async=""></script><meta name="theme-color" media="(prefers-color-scheme: light)" content="#fff"/><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a"/><title>Acme</title></head><body class="antialiased">`;
  assert.deepEqual(look(next), { dark: '#0a0a0a', light: '#ffffff' });
});

test('a theme colour with no media fills the scheme that has none of its own', () => {
  assert.deepEqual(
    look(
      `<head><meta name="theme-color" content="#fafafa"><meta name="theme-color" content="#111" media="(prefers-color-scheme:dark)"></head>`,
    ),
    { dark: '#111111', light: '#fafafa' },
  );
  assert.deepEqual(
    look(`<head><meta name="theme-color" content="#111" media="(prefers-color-scheme: dark)">`),
    { dark: '#111111' },
  );
  // A media that names no scheme is not read.
  assert.deepEqual(
    look(`<head><meta name="theme-color" content="#111" media="(min-width: 600px)"></head>`),
    {},
  );
});

test('the first theme colour of a kind counts, and one that is no colour is passed over', () => {
  assert.deepEqual(
    look(
      `<head><meta name="theme-color" content="var(--bg)"><meta name="theme-color" content="#123456"><meta name="theme-color" content="#654321"></head>`,
    ),
    { dark: '#123456', light: '#123456' },
  );
});

test('attributes in any order, quote and case', () => {
  assert.deepEqual(look(`<HTML><HEAD><META CONTENT='#ABC' NAME='Theme-Color'></HEAD>`), {
    dark: '#aabbcc',
    light: '#aabbcc',
  });
  assert.deepEqual(look(`<head><meta content=#abc name=theme-color></head>`), {
    dark: '#aabbcc',
    light: '#aabbcc',
  });
  assert.deepEqual(
    look(`<head>\n<meta\n\tname = "theme-color"\n\tcontent = "rgba(10, 20, 30, 0.5)"\n/>\n</head>`),
    { dark: '#0a141e80', light: '#0a141e80' },
  );
  // The first attribute of a name counts, and `>` in a value ends no tag.
  assert.deepEqual(
    look(`<head><meta data-a="a > b" name="theme-color" content="#fff" content="#000"></head>`),
    { dark: '#ffffff', light: '#ffffff' },
  );
});

test('a page that names no colour gives none', () => {
  assert.deepEqual(
    scanLook(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Plain</title><meta name="msapplication-TileColor" content="#da532c"><meta name="color-scheme" content="dark"></head><body><p>Hello</p></body></html>`,
    ),
    { done: true, look: {} },
  );
  assert.deepEqual(look(''), {});
  assert.deepEqual(look('no tags at all < 3'), {});
});

test('what is in a script, a style, a title or a comment is not read', () => {
  const html = `<html><head>
<script>document.write('<meta name="theme-color" content="#ff0000">'); var a = "</head><body style='background:#00ff00'>";</script>
<style>/* <meta name="theme-color" content="#ff0000"> */ body { background: #00ff00 }</style>
<title><meta name="theme-color" content="#ff0000"></title>
<!-- <meta name="theme-color" content="#ff0000"> -->
<SCRIPT type="application/ld+json">{"a":"<meta name=theme-color content=#ff0000>"}</SCRIPT>
<meta name="theme-color" content="#0000ff">
</head>`;
  assert.deepEqual(look(html), { dark: '#0000ff', light: '#0000ff' });
});

test('a theme colour past the head is not read', () => {
  assert.deepEqual(
    look(
      `<head></head><meta name="theme-color" content="#f00"><body><meta name="theme-color" content="#f00">`,
    ),
    {},
  );
});

test('with no theme colour, the inline background of html or body', () => {
  assert.deepEqual(
    scanLook(
      `<html><head><title>a</title></head><body class="x" style="margin:0;background-color:#111">`,
    ),
    { done: true, look: { dark: '#111111', light: '#111111' } },
  );
  assert.deepEqual(
    look(`<html style="background: white"><head></head><body style="background: black">`),
    { dark: '#ffffff', light: '#ffffff' },
  );
  assert.deepEqual(
    look(`<html style="color-scheme: dark"><head></head><BODY STYLE="BACKGROUND: #ABC">`),
    { dark: '#aabbcc', light: '#aabbcc' },
  );
  // A theme colour comes before it.
  assert.deepEqual(
    look(
      `<html style="background:#fff"><head><meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)"></head><body style="background:#fff">`,
    ),
    { dark: '#000000' },
  );
});

test('text that ends in the middle is read as far as it goes', () => {
  assert.deepEqual(scanLook(`<head><meta name="theme-color" content="#12`), {
    done: false,
    look: {},
  });
  assert.deepEqual(scanLook(`<head><meta name="theme-color" content="#123"><script>var a = 1`), {
    done: false,
    look: { dark: '#112233', light: '#112233' },
  });
  assert.deepEqual(scanLook(`<head><!-- <meta name="theme-color" content="#123">`), {
    done: false,
    look: {},
  });
  // With a theme colour the head is enough, without one the body tag is waited for.
  assert.equal(scanLook(`<head><meta name="theme-color" content="#123"></head>`).done, true);
  assert.equal(scanLook(`<head></head>`).done, false);
});

test('malformed tags do no harm', () => {
  for (const html of [
    '<',
    '</',
    '<<<>>>',
    '<meta',
    '<meta name="theme-color" content=',
    '<meta name=theme-color content>',
    '<meta = = name="theme-color">',
    '<meta name="theme-color" content="#fff',
    '<head><meta name="theme-color" content="#fff"',
    '<constructor><toString style="background:#fff">',
  ]) {
    assert.deepEqual(look(html), {}, html);
  }
});

test('the colours of the answer are read with no trust in their shape', () => {
  assert.deepEqual(readLook({ look: { dark: '#000000', light: '#ffffff' }, ok: true }), {
    dark: '#000000',
    light: '#ffffff',
  });
  assert.deepEqual(readLook({ look: { dark: '#00000080' }, ok: true }), { dark: '#00000080' });
  assert.deepEqual(readLook({ look: { dark: 'red', light: '#fff' }, ok: true }), null);
  assert.deepEqual(readLook({ look: { dark: 7, light: '#FFFFFF' }, ok: true }), null);
  assert.deepEqual(
    readLook({ look: { dark: 'url(https://example.com)', light: '#ffffff' }, ok: true }),
    { light: '#ffffff' },
  );
  assert.equal(readLook({ look: '#ffffff', ok: true }), null);
  assert.equal(readLook({ look: null, ok: true }), null);
  assert.equal(readLook({ ok: true }), null);
  assert.equal(readLook(null), null);
});
