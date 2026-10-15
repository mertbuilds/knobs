import { colors, radius, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { Card, Chips, Line, Row, Rows } from '../lib/card.tsx';
import { Chip } from '../lib/chip.tsx';
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

const styles = create({
  // Wider than the viewport on purpose, so the page scrolls sideways while it is shown.
  past: {
    backgroundColor: colors.track,
    borderRadius: radius.base,
    boxSizing: 'border-box',
    color: colors.muted,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    paddingBlock: spacing.s1,
    paddingInline: spacing.s2,
    width: 'calc(100vw + 48px)',
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
      online: String(navigator.onLine),
      rtt: link?.rtt === undefined ? m.read_none() : unit(link.rtt, 'millisecond'),
      saveData: link?.saveData === undefined ? m.read_none() : String(link.saveData),
      type: link?.effectiveType ?? m.read_none(),
    };
  },
  all(onWindow('online', 'offline'), onConnection),
);

/** What `navigator` says of the network. Requests go out as before. */
export function NetworkCard() {
  const read = useLive(network);
  return (
    <Card title={m.knob_network()}>
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
  () => ({
    columns: window.matchMedia(WIDE).matches ? m.viewport_two() : m.viewport_one(),
    orientation: mediaValue('orientation', ['portrait', 'landscape']),
    ratio: String(window.devicePixelRatio),
    screen: `${window.screen.width} × ${window.screen.height}`,
    size: `${window.innerWidth} × ${window.innerHeight}`,
  }),
  all(onWindow('resize'), onMedia(WIDE, '(orientation: portrait)')),
);

/**
 * The viewport a device, a width or a fold gives the page. A Duo shut on its
 * cover screen is one column here, and open on its inner screen it is two.
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
      <Rows>
        <Row name={m.read_viewport()} value={read?.size ?? null} />
        <Row name={m.read_columns()} value={read?.columns ?? null} />
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
      userAgent: navigator.userAgent,
      vendor: navigator.vendor,
    };
  },
  // A user agent has no event: the page looks again every second.
  every(1000),
);

/** Who the browser says it is, to scripts. The server still gets the real header. */
export function AgentCard() {
  const read = useLive(agent);
  return (
    <Card title={m.knob_agent()}>
      <Rows>
        <Row name={m.read_user_agent()} value={read?.userAgent ?? null} />
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

/**
 * What a device's touch screen changes for the page, a chip that says which
 * kind of pointer pressed it, and two top layers to move the touch dot over.
 */
export function PointerCard() {
  const read = useLive(pointer);
  const pressed = useLive(press);
  return (
    <Card title={m.knob_pointer()}>
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

/**
 * A box the page pushes past the viewport's edge when asked, for the overflow
 * knob to mark. Off at rest: a landing page that scrolls sideways is a bug.
 */
export function DebugCard() {
  const [pushed, setPushed] = useState(false);
  return (
    <Card title={m.knob_debug()}>
      <Line>{m.debug_line()}</Line>
      <Chips>
        <Chip aria-pressed={pushed} onClick={() => setPushed(!pushed)}>
          {pushed ? m.debug_pull() : m.debug_push()}
        </Chip>
      </Chips>
      {pushed && <div {...props(styles.past)}>{m.debug_box()}</div>}
    </Card>
  );
}
