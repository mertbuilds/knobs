import { props } from '@stylexjs/stylex';
import { ClockIcon } from 'lucide-react';
import { m } from '../paraglide/messages.js';
import { dayAt, realNow } from './demos.ts';
import { BLANK, cardStyles, Chip, pageTag, Row, Specimen, useReading } from './specimen.tsx';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Often enough that a clock running ten times as fast shows every second.
const EVERY = 100;

type Unit = 'day' | 'hour' | 'minute' | 'second';

/** A count with its unit written in full, such as `4 hours`, plural and all. */
function amount(tag: string, count: number, unit: Unit): string {
  return new Intl.NumberFormat(tag, { style: 'unit', unit, unitDisplay: 'long' }).format(count);
}

/** `4 hours 12 minutes 9 seconds`, from the largest unit that is not zero. */
function span(tag: string, ms: number): string {
  const seconds = Math.ceil(ms / SECOND);
  const parts = [amount(tag, seconds % 60, 'second')];
  if (seconds >= 60) {
    parts.unshift(amount(tag, Math.floor(seconds / 60) % 60, 'minute'));
  }
  if (seconds >= 3600) {
    parts.unshift(amount(tag, Math.floor(seconds / 3600), 'hour'));
  }
  return new Intl.ListFormat(tag, { style: 'narrow', type: 'unit' }).format(parts);
}

function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return m.time_morning();
  }
  if (hour >= 12 && hour < 18) {
    return m.time_afternoon();
  }
  return hour >= 18 && hour < 22 ? m.time_evening() : m.time_night();
}

/**
 * A shop's clock lines, from `new Date()` as an app reads it. The two ends
 * stand in for dates a server would send, so they come from the real day: the
 * sale ends at the next midnight and the trial three days on, whatever the
 * clock knob says. The knob only moves the "now" they are counted from.
 */
function readTime() {
  const tag = pageTag();
  const now = new Date();
  const real = realNow();
  const saleLeft = dayAt(real, 1) - now.getTime();
  const trialDays = Math.round((dayAt(real, 3) - dayAt(now.getTime(), 0)) / DAY);
  return {
    clock: new Intl.DateTimeFormat(tag, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now),
    day: new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', weekday: 'long' }).format(
      now,
    ),
    greeting: greeting(now.getHours()),
    sale: saleLeft > 0 ? m.time_sale_left({ time: span(tag, saleLeft) }) : m.time_sale_ended(),
    trial:
      trialDays > 0
        ? m.time_trial_left({ days: amount(tag, trialDays, 'day') })
        : m.time_trial_ended(),
  };
}

let last: { key: string; time: ReturnType<typeof readTime> } | undefined;

/**
 * The lines only change with the second, the language or the time zone, so a
 * look in between hands back the same lines and nothing draws again.
 */
function readTimeOnce() {
  const now = new Date();
  const key = `${Math.floor(now.getTime() / SECOND)} ${now.getTimezoneOffset()} ${pageTag()}`;
  if (last?.key !== key) {
    last = { key, time: readTime() };
  }
  return last.time;
}

export function TimeSpecimen() {
  const time = useReading(readTimeOnce, EVERY);
  return (
    <Specimen
      chips={
        <>
          <Chip demo="tomorrow" label={m.try_tomorrow()} />
          <Chip demo="midnight" label={m.try_midnight()} />
          <Chip demo="fast" label={m.try_fast()} />
          <Chip demo="frozen" label={m.try_frozen()} />
        </>
      }
      icon={ClockIcon}
      label={m.try_time()}
    >
      <div {...props(cardStyles.card)}>
        <Row start={time?.greeting ?? BLANK} />
        <Row end={time?.clock ?? BLANK} quiet start={time?.day ?? BLANK} />
        <div {...props(cardStyles.rule)} />
        <Row start={time?.sale ?? BLANK} />
        <Row start={time?.trial ?? BLANK} />
      </div>
    </Specimen>
  );
}
