import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frameAncestorsRefuse,
  frameOptionsRefuse,
  isLocal,
  publicAddress,
  readVerdict,
  refusesFraming,
  toAddress,
} from './address.ts';

function headers(...pairs: Array<[string, string]>): Headers {
  const all = new Headers();
  for (const [name, value] of pairs) {
    all.append(name, value);
  }
  return all;
}

test('a typed name gets https, a local one http', () => {
  assert.equal(toAddress('example.com')?.href, 'https://example.com/');
  assert.equal(toAddress('  example.com/pricing?a=1 ')?.href, 'https://example.com/pricing?a=1');
  assert.equal(toAddress('http://example.com')?.href, 'http://example.com/');
  assert.equal(toAddress('http://localhost:3000')?.href, 'http://localhost:3000/');
  assert.equal(toAddress('localhost:3000')?.href, 'http://localhost:3000/');
  assert.equal(toAddress('app.localhost')?.href, 'http://app.localhost/');
  assert.equal(toAddress('mac.local:5173')?.href, 'http://mac.local:5173/');
  assert.equal(toAddress('192.168.1.20:8080')?.href, 'http://192.168.1.20:8080/');
  assert.equal(toAddress('https://localhost:3000')?.href, 'https://localhost:3000/');
});

test('anything that is not an http or https site is no address', () => {
  for (const typed of [
    '',
    '   ',
    'hello',
    'hello world',
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/hosts',
    'ftp://example.com',
    'mailto:me@example.com',
    'https://user:pass@example.com',
    'user@example.com',
    `example.com/${'a'.repeat(2100)}`,
  ]) {
    assert.equal(toAddress(typed), null, typed);
  }
});

test('local sites are the loopback, private and link local ones', () => {
  for (const address of [
    'http://localhost',
    'http://LOCALHOST.:3000',
    'http://app.localhost',
    'http://mac.local',
    'http://127.0.0.1',
    'http://127.1',
    'http://10.0.0.4',
    'http://172.16.0.1',
    'http://172.31.255.1',
    'http://192.168.0.1',
    'http://169.254.169.254',
    'http://0.0.0.0',
    'http://[::1]',
    'http://[fd12:3456::1]',
    'http://[fe80::1]',
  ]) {
    assert.equal(isLocal(new URL(address)), true, address);
  }
  for (const address of [
    'https://example.com',
    'http://8.8.8.8',
    'http://172.32.0.1',
    'http://[2606:4700::1111]',
    'https://localhost.example.com',
    'https://local',
  ]) {
    assert.equal(isLocal(new URL(address)), false, address);
  }
});

test('the server asks public names only', () => {
  for (const address of [
    'https://example.com/',
    'http://example.com/',
    'https://www.example.co.uk/a?b=c',
    'https://example.com:8443/',
    'http://example.com:8080/',
    'https://example.com./',
    'https://xn--bcher-kva.de/',
    'https://shop.xn--p1ai/',
  ]) {
    assert.notEqual(publicAddress(address), null, address);
  }
  for (const address of [
    'not an address',
    'ftp://example.com/',
    'javascript:alert(1)',
    'https://user:pass@example.com/',
    'https://user@example.com/',
    'https://example.com:3000/',
    'https://example.com:22/',
    'http://localhost/',
    'http://localhost./',
    'http://app.localhost/',
    'http://mac.local/',
    'http://db.internal/',
    'http://router.lan/',
    'http://service.corp/',
    'http://example.test/',
    'http://intranet/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://017700000001/',
    'http://8.8.8.8/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[2606:4700::1111]/',
    `https://example.com/${'a'.repeat(2100)}`,
  ]) {
    assert.equal(publicAddress(address), null, address);
  }
});

test('x-frame-options: deny and sameorigin refuse, in any case', () => {
  assert.equal(frameOptionsRefuse('DENY'), true);
  assert.equal(frameOptionsRefuse('deny'), true);
  assert.equal(frameOptionsRefuse('SAMEORIGIN'), true);
  assert.equal(frameOptionsRefuse(' SameOrigin '), true);
});

test('x-frame-options: the header sent twice is one value', () => {
  assert.equal(frameOptionsRefuse('SAMEORIGIN, SAMEORIGIN'), true);
  assert.equal(frameOptionsRefuse('DENY,DENY'), true);
});

test('x-frame-options: values the browsers do not follow refuse nothing', () => {
  assert.equal(frameOptionsRefuse(null), false);
  assert.equal(frameOptionsRefuse(''), false);
  assert.equal(frameOptionsRefuse('ALLOWALL'), false);
  assert.equal(frameOptionsRefuse('ALLOW-FROM https://example.com/'), false);
  assert.equal(frameOptionsRefuse('GOFORIT'), false);
  assert.equal(frameOptionsRefuse('foo, bar'), false);
});

test('x-frame-options: a list of different values refuses when one is known', () => {
  assert.equal(frameOptionsRefuse('SAMEORIGIN, DENY'), true);
  assert.equal(frameOptionsRefuse('ALLOWALL, SAMEORIGIN'), true);
  assert.equal(frameOptionsRefuse('ALLOWALL, GOFORIT'), true);
});

test('frame-ancestors: none, self and named hosts refuse', () => {
  assert.equal(frameAncestorsRefuse("frame-ancestors 'none'"), true);
  assert.equal(frameAncestorsRefuse("frame-ancestors 'self'"), true);
  assert.equal(frameAncestorsRefuse('frame-ancestors'), true);
  assert.equal(
    frameAncestorsRefuse('frame-ancestors https://*.myshopify.com https://admin.shopify.com;'),
    true,
  );
  assert.equal(frameAncestorsRefuse("frame-ancestors 'self' https://*.example.com"), true);
});

test('frame-ancestors: every origin, or every one of a scheme, lets a site in', () => {
  assert.equal(frameAncestorsRefuse('frame-ancestors *'), false);
  assert.equal(frameAncestorsRefuse('frame-ancestors https:'), false);
  assert.equal(frameAncestorsRefuse("frame-ancestors 'self' HTTPS:"), false);
  assert.equal(frameAncestorsRefuse('frame-ancestors http: https:'), false);
});

test('frame-ancestors: found in a long policy, in any case, the first one counts', () => {
  const long =
    "default-src 'none'; base-uri 'self'; child-src github.githubassets.com/assets-cdn/worker/; " +
    "connect-src 'self' uploads.github.com www.githubstatus.com; font-src github.githubassets.com; " +
    "form-action 'self' github.com gist.github.com; frame-ancestors 'none'; frame-src viewscreen.githubusercontent.com; " +
    "img-src 'self' data: blob: github.githubassets.com; upgrade-insecure-requests";
  assert.equal(frameAncestorsRefuse(long), true);
  assert.equal(frameAncestorsRefuse("upgrade-insecure-requests; Frame-Ancestors 'self'"), true);
  assert.equal(frameAncestorsRefuse("frame-ancestors *; frame-ancestors 'none'"), false);
  assert.equal(frameAncestorsRefuse("frame-ancestors 'none'; frame-ancestors *"), true);
});

test('frame-ancestors: a policy without it says nothing', () => {
  assert.equal(frameAncestorsRefuse(null), null);
  assert.equal(frameAncestorsRefuse("default-src 'self'; script-src 'self' 'nonce-abc'"), null);
  assert.equal(frameAncestorsRefuse("frame-src 'none'; child-src 'none'"), null);
  assert.equal(frameAncestorsRefuse('upgrade-insecure-requests'), null);
});

test('frame-ancestors: with several policies each one has to let the site in', () => {
  assert.equal(frameAncestorsRefuse("default-src 'self', frame-ancestors 'none'"), true);
  assert.equal(frameAncestorsRefuse("frame-ancestors *, frame-ancestors 'self'"), true);
  assert.equal(frameAncestorsRefuse("frame-ancestors *, default-src 'self'"), false);
});

test('headers: sites that refuse', () => {
  assert.equal(refusesFraming(headers(['X-Frame-Options', 'DENY'])), true);
  assert.equal(refusesFraming(headers(['x-frame-options', 'SAMEORIGIN'])), true);
  assert.equal(
    refusesFraming(headers(['x-frame-options', 'SAMEORIGIN'], ['x-frame-options', 'SAMEORIGIN'])),
    true,
  );
  assert.equal(
    refusesFraming(
      headers(
        ['x-frame-options', 'deny'],
        ['content-security-policy', "default-src 'none'; frame-ancestors 'none'"],
      ),
    ),
    true,
  );
  assert.equal(
    refusesFraming(
      headers(
        ['content-security-policy', "default-src 'self'"],
        ['content-security-policy', "frame-ancestors 'self'"],
      ),
    ),
    true,
  );
});

test('headers: sites that can be shown', () => {
  assert.equal(refusesFraming(headers()), false);
  assert.equal(refusesFraming(headers(['content-type', 'text/html; charset=UTF-8'])), false);
  assert.equal(
    refusesFraming(headers(['content-security-policy', "default-src 'self'; img-src *"])),
    false,
  );
  assert.equal(
    refusesFraming(headers(['x-frame-options', 'ALLOW-FROM https://example.com/'])),
    false,
  );
  assert.equal(
    refusesFraming(headers(['content-security-policy-report-only', "frame-ancestors 'none'"])),
    false,
  );
});

test('headers: frame-ancestors decides, and x-frame-options is not read then', () => {
  assert.equal(
    refusesFraming(
      headers(['x-frame-options', 'DENY'], ['content-security-policy', 'frame-ancestors *']),
    ),
    false,
  );
  assert.equal(
    refusesFraming(
      headers(['x-frame-options', 'DENY'], ['content-security-policy', "default-src 'self'"]),
    ),
    true,
  );
});

test('the answer of the check is read with no trust in its shape', () => {
  assert.equal(readVerdict({ ok: true }), 'ok');
  assert.equal(readVerdict({ ok: false, reason: 'refused' }), 'refused');
  assert.equal(readVerdict({ ok: false, reason: 'unreachable' }), 'unreachable');
  assert.equal(readVerdict({ ok: false, reason: 'invalid' }), 'unchecked');
  assert.equal(readVerdict({ ok: false }), 'unchecked');
  assert.equal(readVerdict({ ok: 'yes' }), 'unchecked');
  assert.equal(readVerdict(null), 'unchecked');
  assert.equal(readVerdict('ok'), 'unchecked');
});
