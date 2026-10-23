import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, keyframes, props, type StyleXStyles } from '@stylexjs/stylex';
import {
  ChevronDownIcon,
  HeartIcon,
  ImagePlusIcon,
  LanguagesIcon,
  MessageCircleIcon,
  PaletteIcon,
  PencilIcon,
  RotateCwIcon,
  SendHorizontalIcon,
  Share2Icon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react';
import { Card, Line } from '../lib/card.tsx';
import { Chip } from '../lib/chip.tsx';
import { ICON } from '../lib/icon.ts';
import { withKeys } from '../lib/keys.tsx';
import { m } from '../paraglide/messages.js';
import { FAKE_SECRET } from './fake.ts';

const API = '/api/demo';
// A reserved top-level domain: no name under it ever resolves, so the request
// fails in the network, with no answer at all.
const NOWHERE = 'https://demo.invalid/';
// A site that sends no CORS headers.
const ELSEWHERE = 'https://example.com/';
const BURST = 20;
const LIKES = 24;
// The stream endpoint's line count, so the summary grows by one share per line.
const STREAM_LINES = 10;
// The photo the composer uploads: under the 16 KB the echo reads, so all of it is read.
const PHOTO_BYTES = 12 * 1024;
const TOAST_MS = 4000;
const OUTCOME_MS = 2000;

const JSON_HEADERS = { 'content-type': 'application/json' };

const WIDE = '@media (min-width: 640px)';
const LESS_MOTION = '@media (prefers-reduced-motion: reduce)';

// The photo's colors: a picture keeps its own in either scheme.
const ART = {
  boat: '#fff7ea',
  glint: '#ffe6b0',
  hillFar: '#c98a9b',
  hillNear: '#7d5272',
  hull: '#3a2a3f',
  seaBottom: '#2f4f86',
  seaTop: '#5b7fb5',
  skyBottom: '#fde2b8',
  skyTop: '#f6a37f',
  sun: '#fff4d6',
};

// The app's own tints, mixed from the page's tokens so they follow the scheme.
const SCENE = {
  hover: `color-mix(in srgb, ${colors.fg} 8%, transparent)`,
  like: colors.error,
  live: colors.error,
  theme: colors.codeNumber,
  // The toast floats over the app, so it keeps a soft shadow in either scheme.
  toastShadow: '0 2px 8px rgb(0 0 0 / 0.18)',
};

const spin = keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

const pop = keyframes({
  '0%': { transform: 'scale(1)' },
  '100%': { transform: 'scale(1)' },
  '40%': { transform: 'scale(1.3)' },
});

const blink = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0.25 },
});

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const styles = create({
  // The app: the post on one side, its comments on the other, one under the other on a phone.
  app: {
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    color: colors.fg,
    columnGap: spacing.s4,
    display: 'grid',
    fontSize: '0.8125rem',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', [WIDE]: 'minmax(0, 1fr) minmax(0, 1fr)' },
    lineHeight: 1.5,
    paddingBlock: spacing.s2,
    paddingInline: 10,
    position: 'relative',
    rowGap: spacing.s3,
  },
  appear: {
    animationDuration: '200ms',
    animationName: { default: rise, [LESS_MOTION]: 'none' },
    animationTimingFunction: 'ease-out',
  },
  attached: {
    alignItems: 'center',
    color: colors.muted,
    display: 'flex',
    fontSize: font.sizeXs,
    gap: 6,
  },
  author: { color: colors.fg },
  avatar: {
    alignItems: 'center',
    borderRadius: '50%',
    display: 'inline-flex',
    flexShrink: 0,
    fontSize: font.sizeXs,
    height: 28,
    justifyContent: 'center',
    lineHeight: 1,
    width: 28,
  },
  avatarSmall: { fontSize: '0.625rem', height: 22, width: 22 },
  bar: {
    alignItems: 'center',
    display: 'flex',
    gap: 2,
    minHeight: 28,
  },
  boat: { fill: ART.boat },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    minWidth: 0,
  },
  // A comment takes focus when it is what a press brought in.
  comment: {
    alignItems: 'flex-start',
    borderRadius: radius.base,
    display: 'flex',
    gap: spacing.s2,
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: { ':focus-visible': 'solid', default: 'none' },
    outlineWidth: 1,
  },
  comments: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  commentText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  // The page's quiet ring goes round the whole composer while its field has focus.
  composer: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.base,
    display: 'flex',
    gap: 2,
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: { ':has(> input:focus-visible)': 'solid', default: 'none' },
    outlineWidth: 1,
    paddingInlineStart: spacing.s2,
  },
  count: {
    fontVariantNumeric: 'tabular-nums',
    minWidth: '2ch',
  },
  dot: {
    backgroundColor: colors.muted,
    borderRadius: '50%',
    flexShrink: 0,
    height: 6,
    width: 6,
  },
  dotLive: {
    animationDirection: 'alternate',
    animationDuration: '600ms',
    animationIterationCount: 'infinite',
    animationName: { default: blink, [LESS_MOTION]: 'none' },
    backgroundColor: SCENE.live,
  },
  dotOn: { backgroundColor: SCENE.live },
  error: { color: colors.error },
  feed: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    flexGrow: 1,
    minWidth: 0,
  },
  glint: { fill: ART.glint, opacity: 0.75 },
  grow: { flexGrow: 1 },
  head: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s2,
  },
  heart: { color: SCENE.like },
  heartPop: {
    animationDuration: '300ms',
    animationName: { default: pop, [LESS_MOTION]: 'none' },
    animationTimingFunction: 'ease-out',
  },
  hillFar: { fill: ART.hillFar },
  hillNear: { fill: ART.hillNear },
  hull: { fill: ART.hull },
  // An icon button of the app: a quiet square that shows a tint of the ink on hover.
  icon: {
    alignItems: 'center',
    backgroundColor: { ':hover': SCENE.hover, default: 'transparent' },
    borderRadius: radius.base,
    borderStyle: 'none',
    color: { ':hover': colors.fg, default: colors.muted },
    cursor: { ':disabled': 'default', default: 'pointer' },
    display: 'inline-flex',
    flexShrink: 0,
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    gap: spacing.s1,
    height: 28,
    justifyContent: 'center',
    lineHeight: 1.5,
    minWidth: 28,
    opacity: { ':disabled': 0.5, default: 1 },
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: { ':focus-visible': 'solid', default: 'none' },
    outlineWidth: 1,
    padding: 0,
    paddingInline: 6,
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color',
  },
  input: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    color: colors.fg,
    flexGrow: 1,
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    minWidth: 0,
    outlineStyle: 'none',
    paddingBlock: spacing.s1,
  },
  link: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    color: colors.link,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: { ':focus-visible': 'solid', default: 'none' },
    outlineWidth: 1,
    padding: 0,
    textDecorationLine: { ':hover': 'underline', default: 'none' },
  },
  liveOn: { color: colors.fg },
  muted: { color: colors.muted },
  note: {
    color: colors.muted,
    fontSize: font.sizeXs,
    margin: 0,
  },
  p: { margin: 0 },
  photo: {
    borderRadius: radius.base,
    display: 'block',
    height: 150,
    width: '100%',
  },
  progress: {
    backgroundColor: colors.track,
    borderRadius: 2,
    flexGrow: 1,
    height: 4,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.accent,
    display: 'block',
    height: '100%',
    transitionDuration: { default: '400ms', [LESS_MOTION]: '0s' },
    transitionProperty: 'width',
    transitionTimingFunction: 'ease-out',
  },
  seaBottom: { stopColor: ART.seaBottom },
  seaTop: { stopColor: ART.seaTop },
  // Placeholder rows where the comments will be, until they are asked for.
  skeleton: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s2,
  },
  skeletonBar: {
    backgroundColor: colors.border,
    borderRadius: 3,
    display: 'block',
    height: 6,
  },
  skeletonBars: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    gap: spacing.s1,
  },
  skeletonDot: { backgroundColor: colors.track },
  skyBottom: { stopColor: ART.skyBottom },
  skyTop: { stopColor: ART.skyTop },
  spinning: {
    animationDuration: '900ms',
    animationIterationCount: 'infinite',
    animationName: { default: spin, [LESS_MOTION]: 'none' },
    animationTimingFunction: 'linear',
  },
  status: {
    alignItems: 'center',
    color: colors.muted,
    display: 'inline-flex',
    fontSize: font.sizeXs,
    gap: spacing.s1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  summary: {
    backgroundColor: colors.card,
    borderRadius: radius.base,
    color: colors.fg,
    margin: 0,
    paddingBlock: spacing.s1,
    paddingInline: spacing.s2,
  },
  sun: { fill: ART.sun },
  thumb: {
    borderRadius: 2,
    display: 'block',
    flexShrink: 0,
    height: 18,
    width: 32,
  },
  thumbBig: {
    height: 36,
    marginBlockStart: spacing.s1,
    width: 64,
  },
  // A soft avatar: the person's color on a tint of it, so the initial reads in either scheme.
  tintFg: {
    backgroundColor: `color-mix(in srgb, ${colors.muted} 18%, ${colors.raised})`,
    color: colors.muted,
  },
  tintName: {
    backgroundColor: `color-mix(in srgb, ${colors.codeName} 18%, ${colors.raised})`,
    color: colors.codeName,
  },
  tintNumber: {
    backgroundColor: `color-mix(in srgb, ${colors.codeNumber} 18%, ${colors.raised})`,
    color: colors.codeNumber,
  },
  tintString: {
    backgroundColor: `color-mix(in srgb, ${colors.codeString} 18%, ${colors.raised})`,
    color: colors.codeString,
  },
  tintTheme: {
    backgroundColor: `color-mix(in srgb, ${SCENE.theme} 18%, ${colors.raised})`,
    color: SCENE.theme,
  },
  tintYou: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 18%, ${colors.raised})`,
    color: colors.accent,
  },
  titled: { color: SCENE.theme },
  // The app's message: ink on the page's ground, over the app's foot.
  toast: {
    alignItems: 'center',
    backgroundColor: colors.fg,
    borderRadius: radius.base,
    boxShadow: SCENE.toastShadow,
    color: colors.bg,
    columnGap: spacing.s3,
    display: 'flex',
    fontSize: font.sizeXs,
    justifyContent: 'space-between',
    lineHeight: 1.5,
    paddingBlock: spacing.s1,
    paddingInline: 10,
    pointerEvents: 'auto',
  },
  toastAction: {
    backgroundColor: 'transparent',
    borderColor: `color-mix(in srgb, ${colors.bg} 40%, transparent)`,
    borderRadius: radius.base,
    borderStyle: 'solid',
    borderWidth: 1,
    color: colors.bg,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 1.4,
    outlineColor: colors.bg,
    outlineOffset: 1,
    outlineStyle: { ':focus-visible': 'solid', default: 'none' },
    outlineWidth: 1,
    paddingInline: 6,
  },
  toastSlot: {
    display: 'flex',
    insetBlockEnd: spacing.s2,
    insetInline: spacing.s2,
    justifyContent: 'center',
    pointerEvents: 'none',
    position: 'absolute',
  },
  // The rarer requests, one plain row each.
  more: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
  },
  moreHead: {
    alignItems: 'center',
    color: colors.muted,
    cursor: 'pointer',
    display: 'flex',
    fontSize: '0.8125rem',
    gap: spacing.s1,
    lineHeight: 1.5,
    listStyle: 'none',
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: { ':focus-visible': 'solid', default: 'none' },
    outlineWidth: 1,
    width: 'max-content',
  },
  moreIconOpen: { transform: 'rotate(180deg)' },
  moreRows: {
    display: 'grid',
    gap: 2,
    gridTemplateColumns: { default: '1fr', [WIDE]: '1fr 1fr' },
    marginBlockStart: spacing.s1,
  },
  row: {
    alignItems: 'baseline',
    backgroundColor: { ':hover': SCENE.hover, default: 'transparent' },
    borderRadius: radius.base,
    borderStyle: 'none',
    color: colors.fg,
    columnGap: spacing.s3,
    cursor: 'pointer',
    display: 'flex',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    justifyContent: 'space-between',
    lineHeight: 1.5,
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: { ':focus-visible': 'solid', default: 'none' },
    outlineWidth: 1,
    paddingBlock: 2,
    paddingInline: 6,
    textAlign: 'start',
  },
  rowValue: {
    color: colors.muted,
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
});

let loads = 0;

/** A demo asset's address, new on every press, so the browser asks for it again. */
function fresh(asset: string): string {
  loads += 1;
  return `${API}/${asset}?t=${Date.now().toString(36)}-${loads}`;
}

/** Sends a fetch and reads the whole answer. A status that is not 2xx throws. */
async function call(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  await response.arrayBuffer();
  if (!response.ok && response.type !== 'opaque') {
    throw new Error(String(response.status));
  }
  return response;
}

function sendJson(method: string, body: unknown): Promise<Response> {
  return call(`${API}/echo`, { body: JSON.stringify(body), headers: JSON_HEADERS, method });
}

/** Sends a fetch, reads the whole answer, and gives its status. */
async function send(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init);
  await response.arrayBuffer();
  return response.type === 'opaque' ? m.requests_opaque() : String(response.status);
}

/** Reads a body to its end, handing each chunk's text to `chunk`. */
async function readAll(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  chunk: (text: string) => void,
): Promise<void> {
  const { done, value } = await reader.read();
  if (done) {
    return;
  }
  chunk(decoder.decode(value, { stream: true }));
  await readAll(reader, decoder, chunk);
}

/** Reads a streamed answer as it comes, handing over the text so far each time. */
async function streamed(url: string, init: RequestInit, onText: (text: string) => void) {
  const response = await fetch(url, init);
  const reader = response.body?.getReader();
  if (!response.ok || reader === undefined) {
    throw new Error(String(response.status));
  }
  let text = '';
  await readAll(reader, new TextDecoder(), (part) => {
    text += part;
    onText(text);
  });
}

function withSecrets(): Promise<string> {
  return send(`${API}/echo?access_token=${FAKE_SECRET}&page=2`, {
    headers: { authorization: `Bearer ${FAKE_SECRET}`, 'x-api-key': FAKE_SECRET },
  });
}

async function burst(): Promise<string> {
  const outcomes = await Promise.allSettled(
    Array.from({ length: BURST }, (_, index) => fetch(`${API}/json?n=${index + 1}`)),
  );
  const answered = outcomes.filter(
    (outcome) => outcome.status === 'fulfilled' && outcome.value.ok,
  ).length;
  return `${answered}/${BURST}`;
}

function xhr(method: string, url: string, timeout = 0): Promise<string> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    request.timeout = timeout;
    request.addEventListener('load', () => resolve(String(request.status)));
    request.addEventListener('error', () => resolve(m.requests_failed()));
    request.addEventListener('timeout', () => resolve(m.requests_timeout()));
    request.send();
  });
}

/** An upload with XHR, the one way a page sees its own upload's progress. */
function upload(body: FormData, onProgress: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API}/echo`);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    });
    request.addEventListener('load', () =>
      request.status < 300 ? resolve() : reject(new Error(String(request.status))),
    );
    request.addEventListener('error', () => reject(new Error('error')));
    request.send(body);
  });
}

/** Settles when the element has loaded or failed, and takes it off the page. */
function settled(element: HTMLElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const end = (failed: boolean) => {
      element.remove();
      if (failed) {
        reject(new Error('failed'));
      } else {
        resolve();
      }
    };
    element.addEventListener('load', () => end(false), { once: true });
    element.addEventListener('error', () => end(true), { once: true });
  });
}

function image(): Promise<void> {
  const element = new Image();
  const done = settled(element);
  element.src = fresh('asset.png');
  return done;
}

function stylesheet(): Promise<void> {
  const element = document.createElement('link');
  element.rel = 'stylesheet';
  element.href = fresh('asset.css');
  const done = settled(element);
  document.head.append(element);
  return done;
}

function script(): Promise<void> {
  const element = document.createElement('script');
  element.src = fresh('asset.js');
  const done = settled(element);
  document.head.append(element);
  return done;
}

// Loaded and let go: the face is never added to the document's fonts.
async function fontFace(): Promise<void> {
  await new FontFace('knobs demo', `url(${fresh('asset.woff2')})`).load();
}

/** Moves focus to what replaced the control that had it, unless the visitor moved it meanwhile. */
function refocus(target: HTMLElement | null): void {
  if (document.activeElement === null || document.activeElement === document.body) {
    target?.focus();
  }
}

type Toast = { retry: (() => void) | null; text: string };
type Say = (text: string, retry?: () => void) => void;

// The sun's path on the water: x, y and width of each glint.
const GLINTS = [
  [101, 38, 22],
  [104, 41, 16],
  [107, 44, 10],
  [110, 47, 4],
];

/** The bay at first light, drawn: the post's photo, and the one a comment uploads. */
function Photo({ small = false }: { small?: boolean }) {
  // An id per drawing, for its gradients, with only the characters a url() reference takes.
  const id = useId().replaceAll(/[^\w-]/gu, '');
  return (
    <svg
      {...props(small ? styles.thumb : styles.photo, small && styles.thumbBig)}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 160 64"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1">
          <stop {...props(styles.skyTop)} offset="0" />
          <stop {...props(styles.skyBottom)} offset="1" />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" x2="0" y1="0" y2="1">
          <stop {...props(styles.seaTop)} offset="0" />
          <stop {...props(styles.seaBottom)} offset="1" />
        </linearGradient>
      </defs>
      <rect fill={`url(#${id}-sky)`} height="36" width="160" />
      <circle {...props(styles.sun)} cx="112" cy="36" r="10" />
      <path {...props(styles.hillFar)} d="M0 36 V24 Q18 16 36 25 T72 29 Q86 27 98 36 Z" />
      <path {...props(styles.hillNear)} d="M0 36 V30 Q14 25 28 32 L34 36 Z" />
      <rect fill={`url(#${id}-sea)`} height="28" width="160" y="36" />
      {GLINTS.map(([x, y, width]) => (
        <rect {...props(styles.glint)} height="1" key={y} rx="0.5" width={width} x={x} y={y} />
      ))}
      <path {...props(styles.boat)} d="M54 34 V24 L61 34 Z" />
      <path {...props(styles.hull)} d="M50 34.5 H63 L61 37 H52 Z" />
    </svg>
  );
}

/** A person's round mark: the first letter of the name on the person's tint. */
function Avatar({
  name,
  small = false,
  tone,
}: {
  name: string;
  small?: boolean;
  tone: StyleXStyles;
}) {
  return (
    <span {...props(styles.avatar, small && styles.avatarSmall, tone)} aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}

function IconButton({
  children,
  label,
  ...rest
}: {
  'aria-pressed'?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button {...props(styles.icon)} aria-label={label} title={label} type="button" {...rest}>
      {children}
    </button>
  );
}

type Bar = 'cancelled' | 'fresh' | 'idle' | 'refreshing';

/** The feed's head: live updates, a refresh that can be cancelled, and a theme to load. */
function FeedBar({ say, setThemed, themed }: { say: Say; setThemed: () => void; themed: boolean }) {
  const [bar, setBar] = useState<Bar>('idle');
  const [news, setNews] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const refresh = useRef<AbortController | null>(null);
  const goLive = () => {
    setLive(true);
    setNews(0);
    streamed(`${API}/events`, { headers: { accept: 'text/event-stream' } }, (text) =>
      setNews(text.split('event: tick').length - 1),
    )
      .catch(() => say(m.requests_went_wrong(), goLive))
      .finally(() => setLive(false));
  };
  const pressRefresh = () => {
    if (refresh.current !== null) {
      refresh.current.abort();
      return;
    }
    const controller = new AbortController();
    refresh.current = controller;
    setBar('refreshing');
    call(`${API}/slow`, { signal: controller.signal })
      .then(
        () => {
          // The new posts are in now.
          setNews(null);
          setBar('fresh');
        },
        () => {
          if (controller.signal.aborted) {
            setBar('cancelled');
            return;
          }
          setBar('idle');
          say(m.requests_went_wrong(), pressRefresh);
        },
      )
      .finally(() => {
        refresh.current = null;
      });
  };
  const loadTheme = () => {
    Promise.all([image(), stylesheet(), script(), fontFace()]).then(
      () => {
        setThemed();
        say(m.requests_theme_loaded());
      },
      () => say(m.requests_went_wrong(), loadTheme),
    );
  };
  const status =
    bar === 'refreshing'
      ? m.requests_refreshing()
      : bar === 'cancelled'
        ? m.requests_cancelled()
        : news !== null && news > 0
          ? news === 1
            ? m.requests_new_post({ count: news })
            : m.requests_new_posts({ count: news })
          : bar === 'fresh'
            ? m.requests_fresh()
            : '';
  return (
    <div {...props(styles.bar)}>
      <span {...props(styles.feed)}>
        <span {...props(themed && styles.titled)}>{m.requests_feed()}</span>
        <span {...props(styles.status)} role="status">
          {bar === 'refreshing' && <RotateCwIcon {...ICON} {...props(styles.spinning)} size={11} />}
          {status}
        </span>
      </span>
      <IconButton aria-pressed={live} disabled={live} label={m.requests_live()} onClick={goLive}>
        <span {...props(styles.dot, live && styles.dotLive, news !== null && styles.dotOn)} />
        <span {...props(live && styles.liveOn)}>{m.requests_live_label()}</span>
      </IconButton>
      <IconButton
        label={bar === 'refreshing' ? m.requests_cancel() : m.requests_refresh()}
        onClick={pressRefresh}
      >
        {bar === 'refreshing' ? <XIcon {...ICON} /> : <RotateCwIcon {...ICON} />}
      </IconButton>
      <IconButton label={m.requests_theme()} onClick={loadTheme}>
        <PaletteIcon {...ICON} />
      </IconButton>
    </div>
  );
}

/** The post, and everything one does to a post: like, edit, delete and undo, share, translate. */
function Post({ onComments, say, themed }: { onComments: () => void; say: Say; themed: boolean }) {
  const [deleted, setDeleted] = useState(false);
  const [edited, setEdited] = useState(false);
  const [liked, setLiked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  // Set by delete and undo, so focus follows the post's swap and nothing else moves it.
  const swapped = useRef(false);
  useEffect(() => {
    if (swapped.current) {
      swapped.current = false;
      refocus(deleted ? undoButton.current : deleteButton.current);
    }
  }, [deleted]);
  const like = () => {
    const next = !liked;
    // Shown at once, taken back if the server says no.
    setLiked(next);
    (next
      ? sendJson('POST', { like: true, post: 7 })
      : call(`${API}/echo`, { method: 'DELETE' })
    ).catch(() => {
      setLiked(!next);
      say(m.requests_went_wrong(), like);
    });
  };
  const edit = () => {
    sendJson('PATCH', { caption: edited ? m.requests_caption() : m.requests_caption_edited() })
      .then(() => setEdited(!edited))
      .catch(() => say(m.requests_went_wrong(), edit));
  };
  const remove = () => {
    call(`${API}/echo`, { method: 'DELETE' })
      .then(() => {
        swapped.current = true;
        setDeleted(true);
      })
      .catch(() => say(m.requests_went_wrong(), remove));
  };
  const undo = () => {
    sendJson('PUT', { caption: m.requests_caption(), likes: LIKES, post: 7 })
      .then(() => {
        swapped.current = true;
        setDeleted(false);
      })
      .catch(() => say(m.requests_went_wrong(), undo));
  };
  const share = () => {
    call(`${API}/redirect`)
      .then(() => say(m.requests_shared()))
      .catch(() => say(m.requests_went_wrong(), share));
  };
  const translate = () => {
    // The timeout is a guard: a resolver that answers for every name must not leave it hanging.
    call(NOWHERE, { signal: AbortSignal.timeout(5000) }).catch(() =>
      say(m.requests_translate_failed(), translate),
    );
  };
  const preview = () => {
    call(ELSEWHERE, { mode: 'cors' }).catch(() => setBlocked(true));
  };
  if (deleted) {
    return (
      <div {...props(styles.head, styles.appear)}>
        <span {...props(styles.grow, styles.muted)}>{m.requests_deleted()}</span>
        <Chip onClick={undo} ref={undoButton}>
          {m.requests_undo()}
        </Chip>
      </div>
    );
  }
  return (
    <article {...props(styles.column, styles.appear)}>
      <div {...props(styles.head)}>
        <Avatar name={m.requests_author()} tone={themed ? styles.tintTheme : styles.tintYou} />
        <span {...props(styles.grow, styles.commentText)}>
          <span>{m.requests_author()}</span>
          <span {...props(styles.note)}>
            {m.requests_ago()}
            {edited && ` · ${m.requests_edited()}`}
          </span>
        </span>
        <IconButton label={m.requests_edit()} onClick={edit}>
          <PencilIcon {...ICON} />
        </IconButton>
        <IconButton label={m.requests_delete()} onClick={remove} ref={deleteButton}>
          <Trash2Icon {...ICON} />
        </IconButton>
      </div>
      <p {...props(styles.p)}>
        {edited ? m.requests_caption_edited() : m.requests_caption()}{' '}
        <button {...props(styles.link)} onClick={preview} type="button">
          {m.requests_link()}
        </button>
      </p>
      {blocked && <p {...props(styles.note, styles.appear)}>{m.requests_preview_blocked()}</p>}
      <Photo />
      <div {...props(styles.bar)}>
        <IconButton aria-pressed={liked} label={m.requests_like()} onClick={like}>
          <HeartIcon
            {...ICON}
            {...props(liked && styles.heart, liked && styles.heartPop)}
            fill={liked ? 'currentColor' : 'none'}
          />
          <span {...props(styles.count)}>{LIKES + (liked ? 1 : 0)}</span>
        </IconButton>
        <IconButton label={m.requests_comments_show()} onClick={onComments}>
          <MessageCircleIcon {...ICON} />
        </IconButton>
        <IconButton label={m.requests_share()} onClick={share}>
          <Share2Icon {...ICON} />
        </IconButton>
        <span {...props(styles.grow)} />
        <IconButton label={m.requests_translate()} onClick={translate}>
          <LanguagesIcon {...ICON} />
        </IconButton>
      </div>
    </article>
  );
}

type Comment = { author: string; id: string; photo: boolean; text: string };

let comments = 0;

type Load = 'failed' | 'idle' | 'loading' | 'shown';

/** The post's comments: loaded on demand, with more, a streamed summary and a composer. */
function Thread({
  open,
  say,
  setOpen,
  themed,
}: {
  open: Load;
  say: Say;
  setOpen: () => void;
  themed: boolean;
}) {
  const [more, setMore] = useState<Load>('idle');
  const [gone, setGone] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summing, setSumming] = useState(false);
  const [mine, setMine] = useState<Array<Comment>>([]);
  const [draft, setDraft] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [photo, setPhoto] = useState(false);
  const firstComment = useRef<HTMLLIElement>(null);
  const moreComment = useRef<HTMLLIElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open === 'shown') {
      refocus(firstComment.current);
    }
  }, [open]);
  useEffect(() => {
    if (more === 'shown') {
      refocus(moreComment.current);
    } else if (more === 'failed') {
      refocus(retryButton.current);
    }
  }, [more]);
  const loadMore = (page: number) => {
    setMore('loading');
    // The first page after these fails on the server; the retry asks again and gets it.
    call(page === 2 ? `${API}/status/500` : `${API}/json?page=${page}`).then(
      () => setMore('shown'),
      () => setMore('failed'),
    );
  };
  const openPost = () => {
    call(`${API}/status/404`).catch(() => setGone(true));
  };
  const summarize = () => {
    const words = m.requests_summary().split(' ');
    setSummary('');
    setSumming(true);
    streamed(`${API}/stream`, {}, (text) => {
      const lines = text.split('\n').length - 1;
      setSummary(words.slice(0, Math.ceil((words.length * lines) / STREAM_LINES)).join(' '));
    })
      .catch(() => {
        setSummary(null);
        say(m.requests_went_wrong(), summarize);
      })
      .finally(() => setSumming(false));
  };
  const attach = () => {
    const body = new FormData();
    body.set('photo', new Blob([new Uint8Array(PHOTO_BYTES)], { type: 'image/jpeg' }), 'bay.jpg');
    setPhoto(false);
    setProgress(0);
    upload(body, setProgress).then(
      () => {
        setProgress(null);
        setPhoto(true);
      },
      () => {
        setProgress(null);
        say(m.requests_went_wrong(), attach);
      },
    );
  };
  const post = () => {
    if (draft.trim() === '' && !photo) {
      return;
    }
    const body = new FormData();
    body.set('text', draft);
    body.set('photo', photo ? 'bay.jpg' : '');
    call(`${API}/echo`, { body, method: 'POST' }).then(
      () => {
        comments += 1;
        setMine([...mine, { author: m.requests_you(), id: String(comments), photo, text: draft }]);
        setDraft('');
        setPhoto(false);
      },
      () => say(m.requests_went_wrong(), post),
    );
  };
  if (open !== 'shown') {
    return (
      <div {...props(styles.column)}>
        <div {...props(styles.bar)}>
          <span {...props(styles.muted)}>{m.requests_comments()}</span>
        </div>
        {['62%', '44%'].map((width) => (
          <div {...props(styles.skeleton)} aria-hidden="true" key={width}>
            <span {...props(styles.avatar, styles.avatarSmall, styles.skeletonDot)} />
            <span {...props(styles.skeletonBars)}>
              <span {...props(styles.skeletonBar)} style={{ width: '20%' }} />
              <span {...props(styles.skeletonBar)} style={{ width }} />
            </span>
          </div>
        ))}
        <Chip disabled={open === 'loading'} onClick={setOpen}>
          {m.requests_comments_show()}
        </Chip>
      </div>
    );
  }
  const lee = { author: m.requests_lee(), id: 'lee', photo: false, text: m.requests_lee_says() };
  const noa = { author: m.requests_noa(), id: 'noa', photo: false, text: m.requests_noa_says() };
  return (
    <div {...props(styles.column, styles.appear)}>
      <div {...props(styles.head)}>
        <span {...props(styles.grow, styles.muted)}>{m.requests_comments()}</span>
        <IconButton disabled={summing} label={m.requests_summarize()} onClick={summarize}>
          <SparklesIcon {...ICON} />
          <span>{m.requests_summarize()}</span>
        </IconButton>
      </div>
      {summary !== null && (
        <p {...props(styles.summary)} aria-live="polite">
          {summary}
        </p>
      )}
      <ul {...props(styles.comments)}>
        <CommentItem item={lee} ref={firstComment} tone={styles.tintName} />
        <li {...props(styles.comment)}>
          <Avatar name={m.requests_sam()} small tone={styles.tintString} />
          <span {...props(styles.commentText)}>
            <span {...props(styles.muted)}>{m.requests_sam()}</span>
            <span>
              {m.requests_sam_says()}{' '}
              <button {...props(styles.link)} onClick={openPost} type="button">
                {m.requests_sam_link()}
              </button>
            </span>
            {gone && <span {...props(styles.note, styles.appear)}>{m.requests_gone()}</span>}
          </span>
        </li>
        {more === 'shown' && <CommentItem item={noa} ref={moreComment} tone={styles.tintNumber} />}
        {mine.map((item) => (
          <CommentItem item={item} key={item.id} tone={themed ? styles.tintTheme : styles.tintFg} />
        ))}
      </ul>
      {more === 'failed' ? (
        <div {...props(styles.head, styles.appear)}>
          <span {...props(styles.grow, styles.error)}>{m.requests_more_failed()}</span>
          <Chip onClick={() => loadMore(3)} ref={retryButton}>
            {m.requests_retry()}
          </Chip>
        </div>
      ) : (
        more !== 'shown' && (
          <button
            {...props(styles.link)}
            disabled={more === 'loading'}
            onClick={() => loadMore(2)}
            type="button"
          >
            {m.requests_more_comments()}
          </button>
        )
      )}
      {progress !== null && (
        <div {...props(styles.attached)}>
          <span>{m.requests_uploading()}</span>
          <span {...props(styles.progress)}>
            <span {...props(styles.progressFill)} style={{ width: `${progress * 100}%` }} />
          </span>
        </div>
      )}
      {photo && (
        <div {...props(styles.attached, styles.appear)}>
          <Photo small />
          <span>{m.requests_attached()}</span>
        </div>
      )}
      <form
        {...props(styles.composer)}
        onSubmit={(event) => {
          event.preventDefault();
          post();
        }}
      >
        <input
          {...props(styles.input)}
          aria-label={m.requests_write()}
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={m.requests_write()}
          value={draft}
        />
        <IconButton disabled={progress !== null} label={m.requests_attach()} onClick={attach}>
          <ImagePlusIcon {...ICON} />
        </IconButton>
        <IconButton
          disabled={draft.trim() === '' && !photo}
          label={m.requests_send()}
          onClick={post}
        >
          <SendHorizontalIcon {...ICON} />
        </IconButton>
      </form>
    </div>
  );
}

function CommentItem({
  item,
  ref,
  tone,
}: {
  item: Comment;
  ref?: Ref<HTMLLIElement>;
  tone: StyleXStyles;
}) {
  return (
    <li
      {...props(styles.comment, styles.appear)}
      ref={ref}
      tabIndex={ref === undefined ? undefined : -1}
    >
      <Avatar name={item.author} small tone={tone} />
      <span {...props(styles.commentText)}>
        <span {...props(styles.muted)}>{item.author}</span>
        {item.text !== '' && <span>{item.text}</span>}
        {item.photo && <Photo small />}
      </span>
    </li>
  );
}

/** One of the rarer requests: a plain row, its request on the right, then what it came to. */
function MoreRow({
  label,
  request,
  send: sendRequest,
}: {
  label: string;
  request: string;
  send: () => Promise<string>;
}) {
  const [outcome, setOutcome] = useState<string | null>(null);
  useEffect(() => {
    if (outcome === null) {
      return;
    }
    const timer = setTimeout(() => setOutcome(null), OUTCOME_MS);
    return () => clearTimeout(timer);
  }, [outcome]);
  const press = () => {
    // Inside a promise, so a request that throws before it starts fails the same way.
    Promise.resolve()
      .then(sendRequest)
      .then(setOutcome, () => setOutcome(m.requests_failed()));
  };
  return (
    <button {...props(styles.row)} onClick={press} type="button">
      <span>{label}</span>
      <span {...props(styles.rowValue)}>{outcome ?? request}</span>
    </button>
  );
}

/**
 * A small social app whose every action is a real request, so the devknobs
 * requests view has each kind to show: fetch in each method and outcome,
 * streams, an XHR upload, and an image, stylesheet, script and font. The rarer
 * kinds sit under "more requests", one row each.
 */
export function RequestsCard() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [themed, setThemed] = useState(false);
  const [open, setOpen] = useState<Load>('idle');
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const say: Say = (text, retry) => setToast({ retry: retry ?? null, text });
  const openComments = () => {
    if (open === 'shown' || open === 'loading') {
      return;
    }
    setOpen('loading');
    call(`${API}/json`).then(
      () => setOpen('shown'),
      () => {
        setOpen('idle');
        say(m.requests_went_wrong(), openComments);
      },
    );
  };
  const rows: Array<[string, string, () => Promise<string>]> = [
    [m.requests_row_text(), 'GET text', () => send(`${API}/text`)],
    [m.requests_row_html(), 'GET html', () => send(`${API}/html`)],
    [m.requests_row_binary(), 'GET bin', () => send(`${API}/bin`)],
    [m.requests_row_big(), 'GET big', () => send(`${API}/big`)],
    [m.requests_row_headers(), 'GET echo', withSecrets],
    [m.requests_row_burst(), `GET json ×${BURST}`, burst],
    [m.requests_row_no_cors(), 'GET example.com', () => send(ELSEWHERE, { mode: 'no-cors' })],
    [m.requests_row_xhr_get(), 'XHR json', () => xhr('GET', `${API}/json`)],
    [m.requests_row_xhr_timeout(), 'XHR slow', () => xhr('GET', `${API}/slow`, 500)],
    [m.requests_row_xhr_error(), 'XHR demo.invalid', () => xhr('GET', NOWHERE)],
  ];
  return (
    <Card title={m.knob_requests()} wide>
      <div {...props(styles.app)}>
        <div {...props(styles.column)}>
          <FeedBar say={say} setThemed={() => setThemed(true)} themed={themed} />
          <Post onComments={openComments} say={say} themed={themed} />
        </div>
        <Thread open={open} say={say} setOpen={openComments} themed={themed} />
        <div {...props(styles.toastSlot)} aria-live="polite" role="status">
          {toast !== null && (
            <div {...props(styles.toast, styles.appear)}>
              <span>{toast.text}</span>
              {toast.retry !== null && (
                <button
                  {...props(styles.toastAction)}
                  onClick={() => {
                    const retry = toast.retry;
                    setToast(null);
                    retry?.();
                  }}
                  type="button"
                >
                  {m.requests_retry()}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <Line>{withKeys(m.requests_hint())}</Line>
      <details {...props(styles.more)} onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
        <summary {...props(styles.moreHead)}>
          {m.requests_more()}
          <ChevronDownIcon {...ICON} {...props(moreOpen && styles.moreIconOpen)} />
        </summary>
        <div {...props(styles.moreRows)}>
          {rows.map(([label, request, sendRequest]) => (
            <MoreRow key={label} label={label} request={request} send={sendRequest} />
          ))}
        </div>
      </details>
    </Card>
  );
}
