import { describe, expect, test } from 'bun:test';
import { isFramePage, movedTo } from '../src/follow.ts';

describe('isFramePage', () => {
  test('is a load of the page above, its fragment aside', () => {
    expect(isFramePage('https://a.test/x?q=1#top', 'https://a.test/x?q=1')).toBe(true);
    expect(isFramePage('https://a.test/x', 'https://a.test/y')).toBe(false);
    expect(isFramePage('https://a.test/x', 'https://b.test/x')).toBe(false);
    expect(isFramePage('not a url', 'not a url')).toBe(false);
  });
});

describe('movedTo', () => {
  test('is where the frame landed on another origin', () => {
    expect(movedTo('https://www.youtube.com/', 'https://m.youtube.com/')).toBe(
      'https://m.youtube.com/',
    );
    expect(movedTo('http://localhost:8000/a', 'http://127.0.0.1:8000/b')).toBe(
      'http://127.0.0.1:8000/b',
    );
  });

  test('is null on the same origin, or for no web page', () => {
    expect(movedTo('https://a.test/', 'https://a.test/other')).toBeNull();
    expect(movedTo('https://a.test/', 'chrome-error://chromewebdata/')).toBeNull();
    expect(movedTo('https://a.test/', 'about:blank')).toBeNull();
    expect(movedTo('https://a.test/', 'nonsense')).toBeNull();
  });
});
