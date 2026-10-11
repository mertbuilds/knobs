/**
 * The addresses the "test on your website" field takes, and what a site's
 * headers say about being shown inside another page. Nothing here touches the
 * page or the network, so the browser and the server read the same rules.
 */

/** The longest address the field and the check take. */
export const MAX_ADDRESS = 2048;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//iu;

/** The host in lowercase, without the dot a full name may end with. */
function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/u, '');
}

function parse(address: string): URL | null {
  try {
    return new URL(address);
  } catch {
    return null;
  }
}

const PRIVATE_V4 = [
  /^0\./u,
  /^10\./u,
  /^127\./u,
  /^169\.254\./u,
  /^172\.(?:1[6-9]|2\d|3[01])\./u,
  /^192\.168\./u,
];
// Loopback, unique local and link local.
const PRIVATE_V6 = /^\[(?:::1\]|f[cd]|fe[89ab])/u;

/**
 * A site only the visitor's own machine or network reaches: localhost,
 * `*.localhost`, `*.local`, and the loopback, private and link local ranges.
 * The server cannot ask these, so the field shows them without a check.
 */
export function isLocal(url: URL): boolean {
  const host = hostOf(url);
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    PRIVATE_V6.test(host) ||
    (/^\d+\.\d+\.\d+\.\d+$/u.test(host) && PRIVATE_V4.some((range) => range.test(host)))
  );
}

/**
 * What a visitor typed, as an address the frame may show, or null. A name with
 * no scheme gets `https`, and `http` where it is a local one. Only `http` and
 * `https` pass, with no user name or password, and a host that is a local one
 * or has a dot in it.
 */
export function toAddress(input: string): URL | null {
  const typed = input.trim();
  if (typed === '' || typed.length > MAX_ADDRESS) {
    return null;
  }
  let url = parse(SCHEME.test(typed) ? typed : `https://${typed}`);
  if (url !== null && !SCHEME.test(typed) && isLocal(url)) {
    url = parse(`http://${typed}`);
  }
  if (
    url === null ||
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.href.length > MAX_ADDRESS
  ) {
    return null;
  }
  return isLocal(url) || hostOf(url).includes('.') ? url : null;
}

// The default ports, and the two a public site is commonly served on besides.
const PORTS = new Set(['', '80', '443', '8080', '8443']);
// Names that are never a public site: private networks, tests, and other name systems.
const CLOSED = new Set([
  'arpa',
  'corp',
  'example',
  'home',
  'internal',
  'intranet',
  'invalid',
  'lan',
  'local',
  'localhost',
  'onion',
  'private',
  'test',
]);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
// Letters only, or punycode. An IPv4 address, in any way of writing it, ends in a number.
const TOP_LABEL = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/u;

/**
 * An address the server may ask: `http` or `https`, no user name or password,
 * one of a few ports, and a host that is a public DNS name. That leaves out
 * every IP address (`URL` writes each form of an IPv4 one as four numbers, and
 * an IPv6 one in brackets), names of one label, and the endings in `CLOSED`.
 */
export function publicAddress(address: string): URL | null {
  if (address.length > MAX_ADDRESS) {
    return null;
  }
  const url = parse(address);
  if (
    url === null ||
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    !PORTS.has(url.port)
  ) {
    return null;
  }
  const labels = hostOf(url).split('.');
  const top = labels.at(-1) ?? '';
  return labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    TOP_LABEL.test(top) &&
    !CLOSED.has(top)
    ? url
    : null;
}

/**
 * `x-frame-options` as the HTML standard reads it, for a page on another
 * origin. Several headers arrive as one list. `deny` and `sameorigin` refuse.
 * A list of different values refuses when any of them is a known one. Anything
 * else, such as `allow-from`, which no browser follows, refuses nothing.
 */
export function frameOptionsRefuse(value: string | null): boolean {
  if (value === null) {
    return false;
  }
  const values = new Set(
    value
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part !== ''),
  );
  if (values.size > 1) {
    return values.has('deny') || values.has('sameorigin') || values.has('allowall');
  }
  return values.has('deny') || values.has('sameorigin');
}

// The sources that let any site in: every origin, or every one of a scheme.
// `http:` matches an `https` page too.
const OPEN = new Set(['*', 'http:', 'https:']);

/**
 * `frame-ancestors` of a `content-security-policy` value, which may hold
 * several policies, one per comma. Every policy that has the directive must
 * let any site in. In a policy the first directive of a name is the one that
 * counts. Null where no policy has it.
 */
export function frameAncestorsRefuse(value: string | null): boolean | null {
  if (value === null) {
    return null;
  }
  const lists = value.split(',').flatMap((policy) => {
    const directive = policy
      .split(';')
      .map((part) => part.trim().split(/\s+/u))
      .find(([name = '']) => name.toLowerCase() === 'frame-ancestors');
    return directive === undefined ? [] : [directive.slice(1)];
  });
  if (lists.length === 0) {
    return null;
  }
  return lists.some((sources) => !sources.some((source) => OPEN.has(source.toLowerCase())));
}

/**
 * Do these response headers keep the page out of a frame on another site?
 * `frame-ancestors` decides where it is set, and `x-frame-options` is not read
 * then, as in the browsers. A report-only policy refuses nothing.
 */
export function refusesFraming(headers: Headers): boolean {
  return (
    frameAncestorsRefuse(headers.get('content-security-policy')) ??
    frameOptionsRefuse(headers.get('x-frame-options'))
  );
}

/** What the server's check said, as the field reads it. */
export type Verdict = 'ok' | 'refused' | 'unchecked' | 'unreachable';

/**
 * The check's answer, read with no trust in its shape. `unchecked` is every
 * answer that is no verdict, such as an address the server does not ask.
 */
export function readVerdict(data: unknown): Verdict {
  if (typeof data !== 'object' || data === null || !('ok' in data)) {
    return 'unchecked';
  }
  if (data.ok === true) {
    return 'ok';
  }
  const reason = 'reason' in data ? data.reason : undefined;
  return reason === 'refused' || reason === 'unreachable' ? reason : 'unchecked';
}
