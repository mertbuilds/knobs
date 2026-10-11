import { useEffect, useRef } from 'react';
import { Card, Group, Row, Rows } from '../lib/card.tsx';
import { Chip } from '../lib/chip.tsx';
import { held, useInView, useLive } from '../lib/live.ts';
import { m } from '../paraglide/messages.js';

// The one item the page writes, a count, under the same name in every store.
const KEY = 'demo-count';
// The page's database and its cache.
const NAME = 'knobs-demo';
const STORE = 'counts';
const CACHED = `/${KEY}`;
// How much of a value a row shows.
const VALUE_MAX = 24;
// How often the card reads again while it is in view. A store tells its own page nothing when
// something else on the page changes it, and the panel is something else on the page.
const READ_EVERY_MS = 1500;

type Stored = {
  readonly cache: string;
  readonly cookies: string;
  readonly databases: string;
  readonly local: string;
  readonly session: string;
};

const stored = held<Stored | null>(null);

/** devknobs' own items, which its storage view hides too. */
function isOwn(key: string): boolean {
  return key === 'devknobs' || key.startsWith('devknobs:');
}

function short(value: string): string {
  return value.length > VALUE_MAX ? `${value.slice(0, VALUE_MAX)}…` : value;
}

function listed(items: ReadonlyArray<string>): string {
  return items.length === 0 ? m.storage_empty() : items.join(', ');
}

/** A count read from text, 0 for anything else. */
function countOf(text: string | null | undefined): number {
  const count = Number(text);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function webItems(storage: () => Storage): string {
  try {
    const store = storage();
    return listed(
      Object.keys(store)
        .filter((key) => !isOwn(key))
        .toSorted()
        .map((key) => `${key} = ${short(store.getItem(key) ?? '')}`),
    );
  } catch {
    return m.read_none();
  }
}

function cookiePairs(): Array<[string, string]> {
  return document.cookie
    .split('; ')
    .filter((pair) => pair !== '')
    .map((pair) => {
      const cut = pair.indexOf('=');
      return cut === -1 ? [pair, ''] : [pair.slice(0, cut), pair.slice(cut + 1)];
    });
}

function cookieItems(): string {
  try {
    return listed(cookiePairs().map(([name, value]) => `${name} = ${short(value)}`));
  } catch {
    return m.read_none();
  }
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error ?? new Error('indexedDB')));
  });
}

/**
 * The page's database, made on the way where `create` allows it. A read never
 * makes one: a database the panel just deleted stays deleted. The connection
 * closes itself when anything asks to delete the database, so a clear is never
 * held up.
 */
async function openDatabase(create: boolean): Promise<IDBDatabase | null> {
  const opening = indexedDB.open(NAME, 1);
  opening.addEventListener('upgradeneeded', () => {
    if (create) {
      opening.result.createObjectStore(STORE);
    } else {
      opening.transaction?.abort();
    }
  });
  try {
    const database = await done(opening);
    database.addEventListener('versionchange', () => database.close());
    return database;
  } catch {
    return null;
  }
}

async function databaseCount(): Promise<number> {
  const database = await openDatabase(false);
  if (database === null) {
    return 0;
  }
  try {
    return countOf(String(await done(database.transaction(STORE).objectStore(STORE).get(KEY))));
  } catch {
    return 0;
  } finally {
    database.close();
  }
}

async function databaseItems(): Promise<string> {
  try {
    const names = (await indexedDB.databases())
      .map((database) => database.name ?? '')
      .filter((name) => name !== '')
      .toSorted();
    const count = names.includes(NAME) ? await databaseCount() : 0;
    return listed(
      names.map((name) => (name === NAME && count > 0 ? `${name}: ${KEY} = ${count}` : name)),
    );
  } catch {
    return m.read_none();
  }
}

async function cacheCount(): Promise<number> {
  const answer = await caches.match(CACHED, { cacheName: NAME });
  return countOf(await answer?.text());
}

async function cacheItems(): Promise<string> {
  try {
    const names = (await caches.keys()).toSorted();
    const count = names.includes(NAME) ? await cacheCount() : 0;
    return listed(
      names.map((name) => (name === NAME && count > 0 ? `${name}: ${KEY} = ${count}` : name)),
    );
  } catch {
    return m.read_none();
  }
}

/** Reads every store again, as the page finds it now. */
async function readAll(): Promise<void> {
  const [databases, cache] = await Promise.all([databaseItems(), cacheItems()]);
  const next: Stored = {
    cache,
    cookies: cookieItems(),
    databases,
    local: webItems(() => localStorage),
    session: webItems(() => sessionStorage),
  };
  const last = stored.read();
  if (last === null || JSON.stringify(last) !== JSON.stringify(next)) {
    stored.set(next);
  }
}

function addToWeb(storage: Storage): void {
  storage.setItem(KEY, String(countOf(storage.getItem(KEY)) + 1));
}

function addToCookie(): void {
  const now = cookiePairs().find(([name]) => name === KEY)?.[1];
  document.cookie = `${KEY}=${countOf(now) + 1}; path=/; max-age=86400; samesite=lax`;
}

async function addToDatabase(): Promise<void> {
  const database = await openDatabase(true);
  if (database === null) {
    return;
  }
  try {
    const store = database.transaction(STORE, 'readwrite').objectStore(STORE);
    const count = countOf(String(await done(store.get(KEY))));
    await done(store.put(count + 1, KEY));
  } finally {
    database.close();
  }
}

async function addToCache(): Promise<void> {
  const count = await cacheCount();
  const cache = await caches.open(NAME);
  await cache.put(CACHED, new Response(String(count + 1)));
}

/** Runs a write, then reads everything back, whether the write went through or not. */
function write(task: () => Promise<void> | void): () => void {
  return () => {
    void Promise.resolve()
      .then(task)
      .catch(() => {})
      .then(readAll);
  };
}

/**
 * A count the page writes into each kind of storage, one more per press, and
 * what the page reads back from all of them. The panel's storage view edits,
 * applies presets and clears; this card is where that shows.
 */
export function StorageCard() {
  const card = useRef<HTMLElement>(null);
  const inView = useInView(card);
  const read = useLive(stored);
  useEffect(() => {
    if (!inView) {
      return;
    }
    const again = () => void readAll();
    again();
    // Another document of this origin wrote, such as the page above a device's frame.
    window.addEventListener('storage', again);
    const timer = setInterval(again, READ_EVERY_MS);
    return () => {
      window.removeEventListener('storage', again);
      clearInterval(timer);
    };
  }, [inView]);
  return (
    <Card ref={card} title={m.knob_storage()} wide>
      <Group label={m.storage_write()}>
        <Chip onClick={write(() => addToWeb(localStorage))}>{m.storage_local()}</Chip>
        <Chip onClick={write(() => addToWeb(sessionStorage))}>{m.storage_session()}</Chip>
        <Chip onClick={write(addToCookie)}>{m.storage_cookie()}</Chip>
        <Chip onClick={write(addToDatabase)}>{m.storage_database()}</Chip>
        <Chip onClick={write(addToCache)}>{m.storage_cache()}</Chip>
      </Group>
      <Rows>
        <Row name={m.storage_local()} value={read?.local ?? null} />
        <Row name={m.storage_session()} value={read?.session ?? null} />
        <Row name={m.read_cookies()} value={read?.cookies ?? null} />
        <Row name={m.storage_database()} value={read?.databases ?? null} />
        <Row name={m.storage_cache()} value={read?.cache ?? null} />
      </Rows>
    </Card>
  );
}
