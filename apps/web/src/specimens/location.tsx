import { create, props } from '@stylexjs/stylex';
import { MapPinIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { m } from '../paraglide/messages.js';
import { useGeoKnob } from './demos.ts';
import { BLANK, cardStyles, Chip, pageTag, Row, Specimen, useReading } from './specimen.tsx';

// The shops the finder knows, each a few kilometres from its city's center, so
// a city's own position still has a distance to show.
const STORES = [
  { lat: 52.499, lng: 13.403, name: m.store_berlin },
  { lat: 40.9903, lng: 29.029, name: m.store_istanbul },
  { lat: 51.539, lng: -0.1426, name: m.store_london },
  { lat: 40.6782, lng: -73.9442, name: m.store_new_york },
  { lat: 37.7599, lng: -122.4148, name: m.store_san_francisco },
  { lat: -23.567, lng: -46.702, name: m.store_sao_paulo },
  { lat: -33.898, lng: 151.179, name: m.store_sydney },
  { lat: 35.6595, lng: 139.7005, name: m.store_tokyo },
] as const;

type Point = { lat: number; lng: number };

type View =
  | { kind: 'empty' }
  | { kind: 'finding' }
  | { code: number; kind: 'error' }
  | (Point & { kind: 'place' });

const EMPTY: View = { kind: 'empty' };

// How long the finder waits for a position before it gives up, in ms.
const PATIENCE = 2000;

// A position that comes at once never shows the waiting line.
const WAITING_AFTER = 200;

const EARTH_RADIUS = 6371;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great circle distance between two points, in kilometres (haversine). */
function distance(from: Point, to: Point): number {
  const lat = Math.sin(radians(to.lat - from.lat) / 2);
  const lng = Math.sin(radians(to.lng - from.lng) / 2);
  const a = lat * lat + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * lng * lng;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function nearest(from: Point) {
  return STORES.map((store) => ({ away: distance(from, store), store })).reduce((best, next) =>
    next.away < best.away ? next : best,
  );
}

/** The language to format the distance in, and the time zone the page reads. */
function readLocale() {
  return {
    tag: pageTag(),
    zone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

const styles = create({
  // The four rows of a found position, so no state makes the card taller.
  body: {
    display: 'grid',
    gap: 1,
    minHeight: 115,
  },
});

/**
 * Where the browser says the visitor is. The page never makes the browser ask
 * for the permission: it looks at the permission first, and asks for a position
 * only where the answer is already yes or no. With the geolocation knob set
 * that is always the case, and a watch then hears every move of the knob.
 */
function useWhere(): View {
  const [view, setView] = useState(EMPTY);
  const knob = useGeoKnob();
  useEffect(() => {
    if (!('geolocation' in navigator) || !('permissions' in navigator)) {
      return;
    }
    const { geolocation } = navigator;
    let gone = false;
    let waiting: ReturnType<typeof setTimeout> | undefined;
    let watch: number | undefined;
    void navigator.permissions.query({ name: 'geolocation' }).then(
      (status) => {
        if (gone) {
          return;
        }
        if (status.state === 'prompt') {
          setView(EMPTY);
          return;
        }
        waiting = setTimeout(() => setView({ kind: 'finding' }), WAITING_AFTER);
        watch = geolocation.watchPosition(
          ({ coords }) => {
            clearTimeout(waiting);
            setView({ kind: 'place', lat: coords.latitude, lng: coords.longitude });
          },
          ({ code }) => {
            clearTimeout(waiting);
            setView({ code, kind: 'error' });
          },
          { timeout: PATIENCE },
        );
      },
      // A browser that cannot say how the permission stands is never asked.
      () => {},
    );
    return () => {
      gone = true;
      clearTimeout(waiting);
      if (watch !== undefined) {
        geolocation.clearWatch(watch);
      }
    };
  }, [knob]);
  return view;
}

/** What a real app says for each way a position can fail to come. */
function failure(code: number): string {
  if (code === 1) {
    return m.place_denied();
  }
  return code === 3 ? m.place_timeout() : m.place_unavailable();
}

function Where({ view }: { view: View }) {
  const locale = useReading(readLocale);
  if (view.kind === 'empty' || view.kind === 'finding') {
    return (
      <p {...props(cardStyles.block, cardStyles.start, cardStyles.quiet)}>
        {view.kind === 'empty' ? m.place_empty() : m.place_finding()}
      </p>
    );
  }
  if (view.kind === 'error') {
    return (
      <div {...props(cardStyles.block)}>
        <p {...props(cardStyles.start)}>{failure(view.code)}</p>
        <p {...props(cardStyles.start, cardStyles.quiet)}>{m.place_by_hand()}</p>
      </div>
    );
  }
  const { away, store } = nearest(view);
  return (
    <>
      <Row
        end={`${view.lat.toFixed(4)}, ${view.lng.toFixed(4)}`}
        quiet
        start={m.place_position()}
      />
      <Row end={store.name()} quiet start={m.place_store()} />
      <Row
        end={
          locale === null
            ? BLANK
            : new Intl.NumberFormat(locale.tag, {
                maximumFractionDigits: 1,
                style: 'unit',
                unit: 'kilometer',
                unitDisplay: 'long',
              }).format(away)
        }
        quiet
        start={m.place_distance()}
      />
      <Row end={locale?.zone ?? BLANK} quiet start={m.seen_zone()} />
    </>
  );
}

export function LocationSpecimen() {
  const view = useWhere();
  return (
    <Specimen
      chips={
        <>
          <Chip demo="tokyo" label={m.try_tokyo()} />
          <Chip demo="istanbul" label={m.try_istanbul()} />
          <Chip demo="newYork" label={m.try_new_york()} />
          <Chip demo="saoPaulo" label={m.try_sao_paulo()} />
          <Chip demo="denied" label={m.try_denied()} />
          <Chip demo="timeout" label={m.try_timeout()} />
        </>
      }
      icon={MapPinIcon}
      label={m.try_location()}
    >
      <div {...props(cardStyles.card)}>
        <div {...props(styles.body)}>
          <Where view={view} />
        </div>
      </div>
    </Specimen>
  );
}
