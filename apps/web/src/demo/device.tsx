import { colors, font, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, defaultMarker, props, when } from '@stylexjs/stylex';
import {
  ArrowRightIcon,
  BotIcon,
  CompassIcon,
  FileTextIcon,
  GlobeIcon,
  MenuIcon,
  MonitorIcon,
  PencilIcon,
  SmartphoneIcon,
  TabletIcon,
  Trash2Icon,
  WifiOffIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AndroidMark,
  AppleMark,
  ChromeMark,
  FirefoxMark,
  GoogleMark,
  KnobsMark,
} from '../lib/brand-marks.tsx';
import { Card, Chips, Line, Row, Rows } from '../lib/card.tsx';
import { Chip } from '../lib/chip.tsx';
import { ICON } from '../lib/icon.ts';
import {
  all,
  every,
  held,
  live,
  mediaValue,
  onMedia,
  onWindow,
  useLive,
  type Watch,
} from '../lib/live.ts';
import { m } from '../paraglide/messages.js';
import { Layers } from './layers.tsx';
import { unit } from './read.ts';

// The page's one breakpoint, as `routes/index.tsx` has it.
const WIDE = '(min-width: 640px)';
// The viewport card's small site: its links from 768 wide, three columns from 1024.
const NAV = '(min-width: 768px)';
const THREE = '(min-width: 1024px)';
// Two columns up to where three begin, so the two queries never both match.
const AT_TWO = '@media (min-width: 640px) and (max-width: 1023.98px)';
const AT_NAV = '@media (min-width: 768px)';
const AT_THREE = '@media (min-width: 1024px)';
const DARK = '(prefers-color-scheme: dark)';
const STILL = '@media (prefers-reduced-motion: reduce)';

const styles = create({
  // A small scene a card draws on the page's ground: what a real page would do with the value.
  scene: {
    backgroundColor: colors.bg,
    borderRadius: radius.base,
    display: 'flex',
    flexDirection: 'column',
    fontSize: '0.8125rem',
    gap: spacing.s2,
    lineHeight: 1.4,
    overflow: 'hidden',
    padding: spacing.s2,
    position: 'relative',
  },
  // A line of text that stands in for content.
  bar: {
    backgroundColor: colors.border,
    borderRadius: 999,
    display: 'block',
    height: 6,
  },
  between: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s2,
    justifyContent: 'space-between',
  },
  inline: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s2,
    minWidth: 0,
  },
  mono: {
    fontFamily: font.mono,
    fontSize: font.sizeXs,
  },
  muted: {
    color: colors.muted,
  },
  small: {
    color: colors.muted,
    fontSize: font.sizeXs,
  },
  // Network: the feed's post, its photo, the signal and the offline toast.
  avatar: {
    backgroundColor: colors.border,
    borderRadius: 999,
    flexShrink: 0,
    height: 20,
    width: 20,
  },
  lines: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    gap: spacing.s1,
  },
  photo: {
    borderRadius: radius.base,
    height: 84,
    overflow: 'hidden',
    position: 'relative',
  },
  picture: {
    display: 'block',
    height: '100%',
    width: '100%',
  },
  // A preview a few pixels across, stretched: what a save data page loads first.
  far: { fill: `color-mix(in srgb, ${colors.codeString} 55%, ${colors.bg})` },
  lite: {
    filter: 'blur(8px) saturate(0.6)',
    transform: 'scale(1.15)',
  },
  near: { fill: colors.codeString },
  offlineFeed: {
    opacity: 0.5,
  },
  signal: {
    alignItems: 'flex-end',
    display: 'flex',
    gap: 2,
    height: 12,
  },
  signalBar: {
    backgroundColor: colors.border,
    borderRadius: 1,
    width: 3,
  },
  signalOn: {
    backgroundColor: colors.fg,
  },
  sky: { fill: `color-mix(in srgb, ${colors.accent} 40%, ${colors.bg})` },
  sun: { fill: colors.warning },
  tap: {
    backgroundColor: {
      ':hover': colors.raised,
      default: colors.bg,
    },
    color: colors.fg,
  },
  toast: {
    alignItems: 'center',
    backgroundColor: colors.fg,
    borderRadius: radius.base,
    bottom: spacing.s2,
    color: colors.bg,
    display: 'flex',
    gap: spacing.s2,
    insetInline: spacing.s2,
    paddingBlock: 6,
    paddingInline: spacing.s2,
    position: 'absolute',
    transitionDuration: { default: '240ms', [STILL]: '0ms' },
    transitionProperty: 'opacity, transform',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
  },
  toastOff: {
    opacity: 0,
    transform: 'translateY(calc(100% + 8px))',
  },
  wait: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    inset: 0,
    justifyContent: 'center',
    position: 'absolute',
  },
  waitText: {
    color: colors.fg,
    fontSize: font.sizeXs,
  },
  // Viewport: a small site that reads the viewport through media queries, and two drawings.
  canvas: {
    backgroundColor: colors.card,
    borderRadius: radius.base,
    color: colors.fg,
    display: 'block',
    height: 56,
    width: '100%',
  },
  figure: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    margin: 0,
    minWidth: 0,
  },
  links: {
    color: colors.muted,
    display: { [AT_NAV]: 'flex', default: 'none' },
    gap: spacing.s3,
  },
  logo: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  menu: {
    alignItems: 'center',
    display: { [AT_NAV]: 'none', default: 'flex' },
  },
  pixels: {
    display: 'grid',
    gap: spacing.s2,
    gridTemplateColumns: '1fr 1fr',
  },
  siteBar: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s2,
    minHeight: 24,
  },
  siteName: {
    flexGrow: 1,
  },
  tile: {
    backgroundColor: colors.card,
    borderRadius: radius.base,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s1,
    padding: spacing.s2,
  },
  tileArt: {
    backgroundColor: colors.border,
    borderRadius: 2,
    height: 18,
  },
  tiles: {
    display: 'grid',
    gap: spacing.s1,
    gridTemplateColumns: {
      [AT_THREE]: '1fr 1fr 1fr',
      [AT_TWO]: '1fr 1fr',
      default: '1fr',
    },
  },
  // Never drawn: its padding is the safe area, for the page to read. One pixel tall, so it has a
  // size to report from the start.
  safe: {
    height: 1,
    paddingBlock: 'env(safe-area-inset-top, 0px) env(safe-area-inset-bottom, 0px)',
    paddingInline: 'env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px)',
    pointerEvents: 'none',
    position: 'absolute',
    visibility: 'hidden',
    width: 0,
  },
  // Touch pointer: one row whose actions wait for a hover, one that a finger can use.
  actions: {
    display: 'flex',
    flexShrink: 0,
  },
  file: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  item: {
    alignItems: 'center',
    backgroundColor: {
      ':hover': { '@media (hover: hover)': colors.card, default: null },
      default: 'transparent',
    },
    borderRadius: radius.base,
    display: 'flex',
    gap: spacing.s2,
    minHeight: 32,
    paddingInline: spacing.s1,
  },
  // Shown only while a hover is on the row, so with no hover never at all.
  action: {
    alignItems: 'center',
    borderRadius: radius.base,
    color: colors.muted,
    display: 'flex',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  noHover: {
    display: { '@media (hover: none)': 'inline', default: 'none' },
    flexShrink: 0,
  },
  waitsForHover: {
    opacity: {
      default: 0,
      [when.ancestor(':hover')]: { '@media (hover: hover)': 1, default: null },
    },
    transitionDuration: '120ms',
    transitionProperty: 'opacity',
  },
  // A finger needs 44 pixels, the size Apple asks a tap target to be.
  finger: {
    height: { '@media (pointer: coarse)': 44, default: 24 },
    width: { '@media (pointer: coarse)': 44, default: 24 },
  },
  // User agent: who the page thinks it talks to, and what a site would show them.
  banner: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.base,
    display: 'flex',
    gap: spacing.s2,
    padding: spacing.s2,
  },
  bannerText: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.base,
    color: colors.muted,
    display: 'inline-flex',
    flexShrink: 0,
    fontSize: font.sizeXs,
    gap: spacing.s1,
    paddingBlock: 2,
    paddingInline: 6,
  },
  download: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.fg,
    borderRadius: radius.base,
    color: colors.bg,
    display: 'flex',
    gap: spacing.s2,
    paddingBlock: 6,
    paddingInline: spacing.s3,
  },
  get: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 16%, ${colors.bg})`,
    borderRadius: 999,
    color: colors.link,
    fontSize: font.sizeXs,
    paddingBlock: 2,
    paddingInline: spacing.s3,
  },
  raw: {
    fontSize: '0.8125rem',
    lineHeight: 1.5,
  },
  rawFull: {
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    margin: 0,
    overflowWrap: 'anywhere',
  },
  rawHead: {
    cursor: 'pointer',
    display: 'flex',
    gap: spacing.s3,
    listStyle: 'none',
    outlineColor: colors.muted,
    outlineOffset: 1,
    outlineStyle: {
      ':focus-visible': 'solid',
      default: 'none',
    },
    outlineWidth: 1,
  },
  rawName: {
    color: colors.muted,
    flexShrink: 0,
  },
  rawShort: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textAlign: 'end',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  // Wider than the viewport on purpose, so the page scrolls sideways while it is shown.
  past: {
    alignItems: 'center',
    backgroundColor: `color-mix(in srgb, ${colors.error} 14%, ${colors.card})`,
    borderRadius: radius.base,
    boxSizing: 'border-box',
    color: colors.fg,
    display: 'flex',
    fontSize: '0.8125rem',
    gap: spacing.s2,
    lineHeight: 1.5,
    paddingBlock: spacing.s2,
    paddingInline: spacing.s2,
    width: 'calc(100vw + 48px)',
  },
});

/** `navigator.connection`, which only Chromium has. */
type Connection = EventTarget & {
  readonly downlink?: number;
  readonly effectiveType?: string;
  readonly rtt?: number;
  readonly saveData?: boolean;
};

function connection(): Connection | null {
  const value = (navigator as { connection?: Connection | null }).connection;
  return typeof value?.addEventListener === 'function' ? value : null;
}

const onConnection: Watch = (update) => {
  const target = connection();
  target?.addEventListener('change', update);
  return () => target?.removeEventListener('change', update);
};

const network = live(
  () => {
    const link = connection();
    return {
      downlink:
        link?.downlink === undefined ? m.read_none() : unit(link.downlink, 'megabit-per-second', 2),
      effective: link?.effectiveType ?? null,
      lite: link?.saveData === true,
      offline: !navigator.onLine,
      online: String(navigator.onLine),
      rtt: link?.rtt === undefined ? m.read_none() : unit(link.rtt, 'millisecond'),
      saveData: link?.saveData === undefined ? m.read_none() : String(link.saveData),
      type: link?.effectiveType ?? m.read_none(),
    };
  },
  all(onWindow('online', 'offline'), onConnection),
);

// How many of the four bars each effective type fills.
const BARS: Record<string, number> = { '2g': 2, '3g': 3, '4g': 4, 'slow-2g': 1 };

function Signal({ offline, type }: { offline: boolean; type: string | null }) {
  const filled = offline || type === null ? 0 : (BARS[type] ?? 0);
  return (
    <span {...props(styles.inline)}>
      {type !== null && !offline && <span {...props(styles.mono, styles.muted)}>{type}</span>}
      <span {...props(styles.signal)} aria-hidden="true">
        {[4, 7, 10, 13].map((height, index) => (
          <span
            {...props(styles.signalBar, index < filled && styles.signalOn)}
            key={height}
            style={{ height }}
          />
        ))}
      </span>
    </span>
  );
}

/** A photo as a feed shows it: whole, or under save data a blurred preview until a tap. */
function Photo({ lite }: { lite: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const waiting = lite && !loaded;
  return (
    <div {...props(styles.photo)}>
      <svg
        {...props(styles.picture, waiting && styles.lite)}
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 160 60"
      >
        <rect {...props(styles.sky)} height="60" width="160" />
        <circle {...props(styles.sun)} cx="118" cy="18" r="8" />
        <path {...props(styles.far)} d="M0 44 L38 22 L70 40 L104 18 L160 42 V60 H0 Z" />
        <path {...props(styles.near)} d="M0 52 Q40 36 80 50 T160 48 V60 H0 Z" />
      </svg>
      {waiting && (
        <div {...props(styles.wait)}>
          <span {...props(styles.waitText)}>{m.net_lite()}</span>
          <Chip onClick={() => setLoaded(true)} style={styles.tap}>
            {m.net_tap()}
          </Chip>
        </div>
      )}
    </div>
  );
}

/** What `navigator` says of the network, and a feed that follows it. Requests go out as before. */
export function NetworkCard() {
  const read = useLive(network);
  const offline = read?.offline === true;
  const lite = read?.lite === true;
  return (
    <Card title={m.knob_network()}>
      <div {...props(styles.scene)}>
        <div {...props(styles.between)}>
          <span>{m.net_feed()}</span>
          <Signal offline={offline} type={read?.effective ?? null} />
        </div>
        <div {...props(styles.lines, offline && styles.offlineFeed)}>
          <div {...props(styles.inline)}>
            <span {...props(styles.avatar)} />
            <span {...props(styles.lines)}>
              <span {...props(styles.bar)} style={{ width: '55%' }} />
              <span {...props(styles.bar)} style={{ width: '35%' }} />
            </span>
          </div>
          {/* A new key per save data value, so turning it on again asks for a tap again. */}
          <Photo key={String(lite)} lite={lite} />
        </div>
        <div
          {...props(styles.toast, !offline && styles.toastOff)}
          aria-hidden={!offline}
          role="status"
        >
          <WifiOffIcon {...ICON} />
          <span>{m.net_offline()}</span>
        </div>
      </div>
      <Rows>
        <Row name={m.read_online()} value={read?.online ?? null} />
        <Row name={m.read_connection()} value={read?.type ?? null} />
        <Row name={m.read_downlink()} value={read?.downlink ?? null} />
        <Row name={m.read_rtt()} value={read?.rtt ?? null} />
        <Row name={m.read_save_data()} value={read?.saveData ?? null} />
      </Rows>
    </Card>
  );
}

const viewport = live(
  () => {
    const wide = window.matchMedia(WIDE).matches;
    const three = window.matchMedia(THREE).matches;
    return {
      columns: wide ? m.viewport_two() : m.viewport_one(),
      dark: window.matchMedia(DARK).matches,
      demo: m.vp_layout({
        columns: three ? m.viewport_three() : wide ? m.viewport_two() : m.viewport_one(),
        nav: window.matchMedia(NAV).matches ? m.vp_links() : m.vp_menu(),
      }),
      dpr: window.devicePixelRatio,
      orientation: mediaValue('orientation', ['portrait', 'landscape']),
      ratio: String(window.devicePixelRatio),
      screen: `${window.screen.width} × ${window.screen.height}`,
      size: `${window.innerWidth} × ${window.innerHeight}`,
    };
  },
  all(onWindow('resize'), onMedia(WIDE, NAV, THREE, DARK, '(orientation: portrait)')),
);

/**
 * Draws the same small specimen into a canvas whose bitmap is `scale` pixels per CSS pixel.
 * At 1 on a sharper screen the browser stretches it, and it blurs.
 */
function draw(canvas: HTMLCanvasElement, scale: number) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (context === null) {
    return;
  }
  const style = getComputedStyle(canvas);
  context.scale(scale, scale);
  context.fillStyle = style.color;
  context.strokeStyle = style.color;
  context.font = `500 26px ${style.fontFamily}`;
  context.textBaseline = 'middle';
  context.fillText('Aa', 10, height / 2 + 1);
  context.lineWidth = 0.75;
  for (let index = 0; index < 4; index += 1) {
    context.beginPath();
    context.arc(width - 30, height / 2, 5 + index * 5, 0, Math.PI * 2);
    context.stroke();
  }
}

/** One drawing at 1x and one at the page's device pixel ratio, side by side. */
function Pixels({ dark, ratio }: { dark: boolean; ratio: number }) {
  const flat = useRef<HTMLCanvasElement>(null);
  const sharp = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const redraw = () => {
      if (flat.current !== null) {
        draw(flat.current, 1);
      }
      if (sharp.current !== null) {
        draw(sharp.current, ratio);
      }
    };
    redraw();
    // A new width would stretch the old bitmap, so each resize draws again.
    const observer = new ResizeObserver(redraw);
    for (const canvas of [flat.current, sharp.current]) {
      if (canvas !== null) {
        observer.observe(canvas);
      }
    }
    return () => observer.disconnect();
  }, [dark, ratio]);
  return (
    <div {...props(styles.pixels)}>
      <figure {...props(styles.figure)}>
        <canvas {...props(styles.canvas)} aria-hidden="true" ref={flat} />
        <figcaption {...props(styles.small)}>{m.vp_flat()}</figcaption>
      </figure>
      <figure {...props(styles.figure)}>
        <canvas {...props(styles.canvas)} aria-hidden="true" ref={sharp} />
        <figcaption {...props(styles.small)}>{m.vp_sharp({ ratio: String(ratio) })}</figcaption>
      </figure>
    </div>
  );
}

/**
 * The viewport a device, a width or a fold gives the page, and a small site
 * that lays itself out by it. A Duo shut on its cover screen is one column
 * here, and open on its inner screen it is two.
 */
export function ViewportCard() {
  const read = useLive(viewport);
  const probe = useRef<HTMLDivElement>(null);
  const [safe, setSafe] = useState<string | null>(null);
  useEffect(() => {
    const element = probe.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(element);
      setSafe(
        [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
          .map((side) => Number.parseFloat(side) || 0)
          .join(' '),
      );
    });
    observer.observe(element, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);
  return (
    <Card title={m.knob_viewport()}>
      <div {...props(styles.scene)} aria-hidden="true">
        <div {...props(styles.siteBar)}>
          <span {...props(styles.logo)} />
          <span {...props(styles.siteName)}>{m.vp_site()}</span>
          <span {...props(styles.links)}>
            <span>{m.vp_docs()}</span>
            <span>{m.vp_pricing()}</span>
            <span>{m.vp_blog()}</span>
          </span>
          <span {...props(styles.menu)}>
            <MenuIcon {...ICON} />
          </span>
        </div>
        <div {...props(styles.tiles)}>
          {[60, 45, 70].map((width) => (
            <span {...props(styles.tile)} key={width}>
              <span {...props(styles.tileArt)} />
              <span {...props(styles.bar)} style={{ width: `${width}%` }} />
            </span>
          ))}
        </div>
        {read !== null && <Pixels dark={read.dark} ratio={read.dpr} />}
      </div>
      <Rows>
        <Row name={m.read_viewport()} value={read?.size ?? null} />
        <Row name={m.read_columns()} value={read?.columns ?? null} />
        <Row name={m.read_demo()} value={read?.demo ?? null} />
        <Row name={m.read_orientation()} value={read?.orientation ?? null} />
        <Row name={m.read_ratio()} value={read?.ratio ?? null} />
        <Row name={m.read_screen()} value={read?.screen ?? null} />
        <Row name={m.read_safe_area()} value={safe} />
      </Rows>
      <div {...props(styles.safe)} aria-hidden="true" ref={probe} />
    </Card>
  );
}

/** The client hints, where the browser has them. */
type AgentData = {
  readonly brands?: ReadonlyArray<{ readonly brand: string; readonly version: string }>;
  readonly mobile?: boolean;
};

type Browser = 'chrome' | 'edge' | 'firefox' | 'googlebot' | 'other' | 'safari';
type System = 'android' | 'chromeos' | 'ios' | 'ipados' | 'linux' | 'macos' | 'other' | 'windows';
type Kind = 'bot' | 'desktop' | 'phone' | 'tablet';

// Product names, the same in every language.
const BROWSER_NAMES: Record<Exclude<Browser, 'other'>, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  googlebot: 'Googlebot',
  safari: 'Safari',
};
const SYSTEM_NAMES: Record<Exclude<System, 'other'>, string> = {
  android: 'Android',
  chromeos: 'ChromeOS',
  ios: 'iOS',
  ipados: 'iPadOS',
  linux: 'Linux',
  macos: 'macOS',
  windows: 'Windows',
};

/** What a site's user agent sniffing makes of the string, in the usual order of its tests. */
function sniff(ua: string, touchPoints: number, mobile: boolean | undefined) {
  const bot = /bot|crawler|spider/i.test(ua);
  const browser: Browser = /Googlebot/.test(ua)
    ? 'googlebot'
    : /Edg(A|iOS)?\//.test(ua)
      ? 'edge'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'firefox'
        : /Chrome\/|CriOS/.test(ua)
          ? 'chrome'
          : /Safari\//.test(ua)
            ? 'safari'
            : 'other';
  // An iPad shows sites a Mac's string, and only its touch points give it away.
  const system: System = /iPhone|iPod/.test(ua)
    ? 'ios'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
      ? 'ipados'
      : /Android/.test(ua)
        ? 'android'
        : /Macintosh/.test(ua)
          ? 'macos'
          : /Windows/.test(ua)
            ? 'windows'
            : /CrOS/.test(ua)
              ? 'chromeos'
              : /Linux|X11/.test(ua)
                ? 'linux'
                : 'other';
  const kind: Kind = bot
    ? 'bot'
    : system === 'ios' || (system === 'android' && /Mobile/.test(ua)) || mobile === true
      ? 'phone'
      : system === 'ipados' || system === 'android'
        ? 'tablet'
        : 'desktop';
  return { browser, kind, system };
}

const agent = live(
  () => {
    const data = (navigator as { userAgentData?: AgentData }).userAgentData;
    return {
      brands:
        data?.brands === undefined || data.brands.length === 0
          ? m.read_none()
          : data.brands.map(({ brand, version }) => `${brand} ${version}`).join(', '),
      mobile: data?.mobile === undefined ? m.read_none() : String(data.mobile),
      platform: navigator.platform,
      sniffed: sniff(navigator.userAgent, navigator.maxTouchPoints, data?.mobile),
      userAgent: navigator.userAgent,
      vendor: navigator.vendor,
    };
  },
  // A user agent has no event: the page looks again every second.
  every(1000),
);

function BrowserMark({ browser }: { browser: Browser }) {
  switch (browser) {
    case 'chrome':
      return <ChromeMark />;
    case 'firefox':
      return <FirefoxMark />;
    case 'googlebot':
      return <GoogleMark />;
    case 'safari':
      return <CompassIcon {...ICON} />;
    default:
      return <GlobeIcon {...ICON} />;
  }
}

function SystemMark({ system }: { system: System }) {
  switch (system) {
    case 'ios':
    case 'ipados':
    case 'macos':
      return <AppleMark />;
    case 'android':
      return <AndroidMark />;
    default:
      return <MonitorIcon {...ICON} />;
  }
}

const KINDS: Record<Kind, { icon: ReactNode; label: () => string }> = {
  bot: { icon: <BotIcon {...ICON} size={12} />, label: m.ua_crawler },
  desktop: { icon: <MonitorIcon {...ICON} size={12} />, label: m.ua_desktop },
  phone: { icon: <SmartphoneIcon {...ICON} size={12} />, label: m.ua_phone },
  tablet: { icon: <TabletIcon {...ICON} size={12} />, label: m.ua_tablet },
};

/** What a site does with the guess: an app banner on a phone, a download on a desktop, plain text for a crawler. */
function Offer({ kind, system }: { kind: Kind; system: System }) {
  if (kind === 'bot') {
    return (
      <div {...props(styles.banner)} aria-hidden="true">
        <BotIcon {...ICON} />
        <span {...props(styles.muted)}>{m.ua_crawler_view()}</span>
      </div>
    );
  }
  const apple = system === 'ios' || system === 'ipados';
  if (apple || system === 'android') {
    return (
      <div {...props(styles.banner)} aria-hidden="true">
        <KnobsMark size={28} />
        <span {...props(styles.bannerText)}>
          <span>{m.ua_app()}</span>
          <span {...props(styles.small)}>{apple ? m.ua_app_store() : m.ua_play_store()}</span>
        </span>
        <span {...props(styles.get)}>{m.ua_get()}</span>
      </div>
    );
  }
  return (
    <span {...props(styles.download)} aria-hidden="true">
      <SystemMark system={system} />
      {system === 'other' ? m.ua_download_any() : m.ua_download({ os: SYSTEM_NAMES[system] })}
    </span>
  );
}

/** Who the browser says it is, to scripts, and what a site would make of it. The server still gets the real header. */
export function AgentCard() {
  const read = useLive(agent);
  const sniffed = read?.sniffed ?? null;
  const kind = sniffed === null ? null : KINDS[sniffed.kind];
  const browser =
    sniffed === null || sniffed.browser === 'other'
      ? m.ua_other_browser()
      : BROWSER_NAMES[sniffed.browser];
  const system =
    sniffed === null || sniffed.system === 'other' ? m.ua_other_os() : SYSTEM_NAMES[sniffed.system];
  return (
    <Card title={m.knob_agent()}>
      {sniffed !== null && kind !== null && (
        <div {...props(styles.scene)}>
          <div {...props(styles.between)}>
            <span {...props(styles.inline)}>
              <BrowserMark browser={sniffed.browser} />
              {sniffed.kind !== 'bot' && <SystemMark system={sniffed.system} />}
              <span>
                {sniffed.kind === 'bot' ? m.ua_bot({ browser }) : m.ua_on({ browser, os: system })}
              </span>
            </span>
            <span {...props(styles.chip)}>
              {kind.icon}
              {kind.label()}
            </span>
          </div>
          <Offer kind={sniffed.kind} system={sniffed.system} />
        </div>
      )}
      <details {...props(styles.raw)}>
        <summary {...props(styles.rawHead)}>
          <span {...props(styles.rawName)}>{m.read_user_agent()}</span>
          <span {...props(styles.rawShort, styles.mono)} title={m.ua_show()}>
            {read?.userAgent ?? ''}
          </span>
        </summary>
        <p {...props(styles.rawFull)}>{read?.userAgent ?? ''}</p>
      </details>
      <Rows>
        <Row name={m.read_platform()} value={read?.platform ?? null} />
        <Row name={m.read_vendor()} value={read?.vendor ?? null} />
        <Row name={m.read_brands()} value={read?.brands ?? null} />
        <Row name={m.read_mobile()} value={read?.mobile ?? null} />
      </Rows>
    </Card>
  );
}

const pointer = live(
  () => ({
    hover: mediaValue('hover', ['hover', 'none']),
    pointer: mediaValue('pointer', ['fine', 'coarse', 'none']),
    touchEvents: String('ontouchstart' in window),
    touchPoints: String(navigator.maxTouchPoints),
  }),
  // The media queries tell of a change. The touch screen itself has no event.
  all(onMedia('(hover: hover)', '(pointer: fine)', '(pointer: coarse)'), every(1000)),
);

// The kind of pointer the last press on the card's chip came from.
const press = held<string | null>(null);

/** A file row with its two actions, as a list on a page draws it. */
function FileRow({ name, ready }: { name: string; ready: boolean }) {
  return (
    <div {...props(styles.item, defaultMarker())}>
      <FileTextIcon {...ICON} />
      <span {...props(styles.file)}>{name}</span>
      {!ready && <span {...props(styles.noHover, styles.small)}>{m.pt_no_hover()}</span>}
      <span {...props(styles.actions, !ready && styles.waitsForHover)}>
        <span {...props(styles.action, ready && styles.finger)}>
          <PencilIcon {...ICON} />
        </span>
        <span {...props(styles.action, ready && styles.finger)}>
          <Trash2Icon {...ICON} />
        </span>
      </span>
    </div>
  );
}

/**
 * What a device's touch screen changes for the page: a row whose actions wait
 * for a hover beside one built for a finger, a chip that says which kind of
 * pointer pressed it, and two top layers to move the touch dot over.
 */
export function PointerCard() {
  const read = useLive(pointer);
  const pressed = useLive(press);
  return (
    <Card title={m.knob_pointer()}>
      <Line>{m.pt_line()}</Line>
      <div {...props(styles.scene)} aria-hidden="true">
        <div {...props(styles.lines)}>
          <span {...props(styles.small)}>{m.pt_hover_only()}</span>
          <FileRow name={m.pt_file_one()} ready={false} />
        </div>
        <div {...props(styles.lines)}>
          <span {...props(styles.small)}>{m.pt_touch_ready()}</span>
          <FileRow name={m.pt_file_two()} ready />
        </div>
      </div>
      <Rows>
        <Row name={m.read_pointer()} value={read?.pointer ?? null} />
        <Row name={m.read_hover()} value={read?.hover ?? null} />
        <Row name={m.read_touch_points()} value={read?.touchPoints ?? null} />
        <Row name={m.read_touch_events()} value={read?.touchEvents ?? null} />
        <Row name={m.read_press()} value={pressed ?? m.pointer_idle()} />
      </Rows>
      <Chips>
        <Chip onPointerDown={(event) => press.set(event.pointerType)}>{m.pointer_press()}</Chip>
      </Chips>
      <Line>{m.layers_line()}</Line>
      <Layers />
    </Card>
  );
}

/** How wide the page is against its viewport. */
type Widths = { client: number; scroll: number };

/**
 * A box the page pushes past the viewport's edge when asked, for the overflow
 * knob to mark. Off at rest: a landing page that scrolls sideways is a bug.
 */
export function DebugCard() {
  const [pushed, setPushed] = useState(false);
  const [widths, setWidths] = useState<Widths | null>(null);
  useEffect(() => {
    const measure = () => {
      const root = document.documentElement;
      setWidths({ client: root.clientWidth, scroll: root.scrollWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pushed]);
  return (
    <Card title={m.knob_debug()}>
      <Line>{m.debug_line()}</Line>
      <Chips>
        <Chip aria-pressed={pushed} onClick={() => setPushed(!pushed)}>
          {pushed ? m.debug_pull() : m.debug_push()}
        </Chip>
      </Chips>
      {pushed && (
        <div {...props(styles.past)}>
          {m.debug_box()}
          <ArrowRightIcon {...ICON} />
        </div>
      )}
      <Rows>
        <Row name={m.read_client_width()} value={widths === null ? null : `${widths.client}px`} />
        <Row name={m.read_scroll_width()} value={widths === null ? null : `${widths.scroll}px`} />
        <Row
          name={m.read_sideways()}
          value={widths === null ? null : String(widths.scroll > widths.client)}
        />
      </Rows>
    </Card>
  );
}
