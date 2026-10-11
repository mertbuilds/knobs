import { useEffect } from 'react';
import { Card, Chips, Row, Rows } from '../lib/card.tsx';
import { Chip } from '../lib/chip.tsx';
import { all, every, held, live, onWindow, useLive, type Watch } from '../lib/live.ts';
import { m } from '../paraglide/messages.js';
import { or, unit } from './read.ts';

const API = '/api/demo';

// One fixed instant for the date row, read in UTC, so only the locale moves it.
const SAMPLE_DATE = Date.UTC(2026, 9, 4, 9, 30);
const SAMPLE_COUNTS = [0, 1, 2, 5];
// Product names, the same in every language.
const SAMPLE_LIST = ['iPhone', 'Pixel', 'iPad'];

/** The `lang` and `dir` of the document, which the locale and direction knobs write. */
const onLanguage: Watch = (update) => {
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributeFilter: ['dir', 'lang'] });
  return () => observer.disconnect();
};

const locale = live(
  () => ({
    currency: or(() =>
      new Intl.NumberFormat(undefined, { currency: 'EUR', style: 'currency' }).format(1499.5),
    ),
    date: or(() =>
      new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeZone: 'UTC' }).format(
        SAMPLE_DATE,
      ),
    ),
    direction: getComputedStyle(document.documentElement).direction,
    language: navigator.language,
    list: or(() => new Intl.ListFormat(undefined, { type: 'conjunction' }).format(SAMPLE_LIST)),
    number: or(() => new Intl.NumberFormat().format(1_234_567.891)),
    plural: or(() => {
      const rules = new Intl.PluralRules();
      return SAMPLE_COUNTS.map((count) => `${count} ${rules.select(count)}`).join(', ');
    }),
    relative: or(() =>
      new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-1, 'day'),
    ),
  }),
  all(onWindow('languagechange'), onLanguage),
);

/** What `Intl` makes of the same values in the language the page reads. */
export function LocaleCard() {
  const read = useLive(locale);
  return (
    <Card title={m.knob_locale()}>
      <Rows>
        <Row name={m.read_language()} value={read?.language ?? null} />
        <Row name={m.read_direction()} value={read?.direction ?? null} />
        <Row name={m.read_date()} value={read?.date ?? null} />
        <Row name={m.read_number()} value={read?.number ?? null} />
        <Row name={m.read_currency()} value={read?.currency ?? null} />
        <Row name={m.read_plural()} value={read?.plural ?? null} />
        <Row name={m.read_list()} value={read?.list ?? null} />
        <Row name={m.read_relative()} value={read?.relative ?? null} />
      </Rows>
    </Card>
  );
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function two(value: number): string {
  return String(Math.trunc(value)).padStart(2, '0');
}

/** `UTC+03:00`, from what `getTimezoneOffset` reports. */
function offsetOf(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const size = Math.abs(minutes);
  return `UTC${minutes < 0 ? '-' : '+'}${two(size / 60)}:${two(size % 60)}`;
}

/** A span of time in its largest unit, as the language says it: `2 days ago`. */
function relative(ms: number): string {
  const size = Math.abs(ms);
  const [unit, per]: [Intl.RelativeTimeFormatUnit, number] =
    size >= DAY
      ? ['day', DAY]
      : size >= HOUR
        ? ['hour', HOUR]
        : size >= MINUTE
          ? ['minute', MINUTE]
          : ['second', SECOND];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
    Math.trunc(ms / per),
    unit,
  );
}

/** `5 hours, 12 minutes, 9 seconds`, the units written in full. */
function span(ms: number): string {
  const parts: Array<[number, string]> = [
    [Math.floor(ms / HOUR), 'hour'],
    [Math.floor((ms % HOUR) / MINUTE), 'minute'],
    [Math.floor((ms % MINUTE) / SECOND), 'second'],
  ];
  const words = parts.map(([count, name]) =>
    new Intl.NumberFormat(undefined, { style: 'unit', unit: name, unitDisplay: 'long' }).format(
      count,
    ),
  );
  return new Intl.ListFormat(undefined, { style: 'long', type: 'unit' }).format(words);
}

// The first instant the page read, on whatever clock it had then.
let opened: number | undefined;

const time = live(
  () => {
    const now = new Date();
    opened ??= now.getTime();
    const since = opened;
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return {
      date: or(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now)),
      midnight: or(() => span(midnight.getTime() - now.getTime())),
      opened: or(() => relative(since - now.getTime())),
      time: or(() => new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(now)),
      zone: `${new Intl.DateTimeFormat().resolvedOptions().timeZone}, ${offsetOf(now)}`,
    };
  },
  // The clock has no event: the page looks again every second, as a page with a clock on it does.
  all(every(SECOND), onWindow('languagechange')),
);

// What the server said it got with the last press, null before the first.
const server = held<string | null>(null);

async function askServer(): Promise<void> {
  try {
    const response = await fetch(`${API}/echo`);
    const answer = (await response.json()) as { headers?: Record<string, string> };
    const sent = answer.headers?.['x-devknobs-now'];
    server.set(sent ?? m.time_server_none());
  } catch {
    server.set(m.requests_failed());
  }
}

/**
 * The time, the day and the zone as the page reads them, a relative time and a
 * countdown, which all follow the clock and the time zone knobs. The button
 * asks the page's own server which time came with the request, for "send to
 * server".
 */
export function TimeCard() {
  const read = useLive(time);
  const got = useLive(server);
  return (
    <Card title={m.knob_time()}>
      <Rows>
        <Row name={m.read_time()} value={read?.time ?? null} />
        <Row name={m.read_day()} value={read?.date ?? null} />
        <Row name={m.read_zone()} value={read?.zone ?? null} />
        <Row name={m.read_opened()} value={read?.opened ?? null} />
        <Row name={m.read_midnight()} value={read?.midnight ?? null} />
        <Row name={m.read_server()} value={got} />
      </Rows>
      <Chips>
        <Chip onClick={() => void askServer()}>{m.time_ask()}</Chip>
      </Chips>
    </Card>
  );
}

type Place = { accuracy: string; latitude: string; longitude: string; state: string };

// What geolocation last said, null until the visitor asks.
const place = held<Place | null>(null);
// The watch that is on, so a second press starts over and leaving the page ends it.
let watching: number | undefined;

function stopWatching(): void {
  if (watching !== undefined) {
    navigator.geolocation.clearWatch(watching);
    watching = undefined;
  }
}

const NO_PLACE = { accuracy: '', latitude: '', longitude: '' };

/** The three failures by the names the spec gives their codes. */
const FAILURES: Record<number, string> = {
  1: 'PERMISSION_DENIED',
  2: 'POSITION_UNAVAILABLE',
  3: 'TIMEOUT',
};

/**
 * Asks for the position, and keeps hearing where it is, so a route in the geo
 * knob moves the numbers. Only a press starts it: the browser may ask the
 * visitor for permission.
 */
function watchPlace(): void {
  if (!('geolocation' in navigator)) {
    place.set({ ...NO_PLACE, state: m.read_none() });
    return;
  }
  stopWatching();
  place.set({ ...NO_PLACE, state: m.location_asking() });
  watching = navigator.geolocation.watchPosition(
    ({ coords }) =>
      place.set({
        accuracy: unit(coords.accuracy, 'meter'),
        latitude: coords.latitude.toFixed(5),
        longitude: coords.longitude.toFixed(5),
        state: m.location_found(),
      }),
    (error) => place.set({ ...NO_PLACE, state: FAILURES[error.code] ?? error.message }),
    { timeout: 6000 },
  );
}

/** The position geolocation reports, or the error it fails with. */
export function LocationCard() {
  const read = useLive(place);
  useEffect(() => stopWatching, []);
  return (
    <Card title={m.knob_location()}>
      <Rows>
        <Row name={m.read_position()} value={read?.state ?? m.location_idle()} />
        <Row name={m.read_latitude()} value={read?.latitude ?? null} />
        <Row name={m.read_longitude()} value={read?.longitude ?? null} />
        <Row name={m.read_accuracy()} value={read?.accuracy ?? null} />
      </Rows>
      <Chips>
        <Chip onClick={watchPlace}>{m.location_ask()}</Chip>
      </Chips>
    </Card>
  );
}
