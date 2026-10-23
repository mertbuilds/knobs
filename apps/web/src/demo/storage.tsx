import { colors, font, radius, shadow, spacing } from '@knobs/ui/tokens.stylex';
import { create, props } from '@stylexjs/stylex';
import {
  CloudCheckIcon,
  CloudDownloadIcon,
  CoffeeIcon,
  CookieIcon,
  HeartIcon,
  MinusIcon,
  NotebookPenIcon,
  PlusIcon,
  ShoppingBagIcon,
  SproutIcon,
  StoreIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { Card, Line, Row, Rows } from '../lib/card.tsx';
import { ICON } from '../lib/icon.ts';
import { withKeys } from '../lib/keys.tsx';
import { held, useInView, useLive } from '../lib/live.ts';
import { m } from '../paraglide/messages.js';
import { or } from './read.ts';

const WIDE = '@media (min-width: 640px)';
const LESS_MOTION = '@media (prefers-reduced-motion: reduce)';

// Where the shop keeps each thing, every name under the shop's own prefix.
const CART = 'knobs-demo:cart';
const VIEWED = 'knobs-demo:viewed';
const CONSENT = 'knobs-demo-consent';
const NAME = 'knobs-demo';
const SAVED = 'saved';
const VERSION = 2;
// What "available offline" keeps: the catalog and a product photo, from the page's own origin.
const OFFLINE = ['/api/demo/json', '/api/demo/asset.png'];
// A consent banner's choice lasts about six months.
const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;
// How often the card reads again while it is in view. A store tells its own page nothing when
// something else on the page changes it, and the panel is something else on the page.
const READ_EVERY_MS = 1500;

// The shelf's tones, mixed from the page's tokens so they follow the scheme.
const SCENE = {
  badge: colors.accent,
  heart: colors.error,
  // A switch's knob is white on its track in either scheme, as a phone's is.
  knob: '#fff',
  // A hairline under the knob, so it reads on a pale track.
  knobShadow: '0 1px 2px rgb(0 0 0 / 0.2)',
  mug: colors.codeNumber,
  notebook: colors.codeKeyword,
  // The badge's count is white on the accent in either scheme.
  onBadge: '#fff',
  plant: colors.codeString,
};

type Id = 'mug' | 'notebook' | 'plant';

const PRODUCTS: ReadonlyArray<{ readonly id: Id; readonly price: number }> = [
  { id: 'mug', price: 12 },
  { id: 'notebook', price: 9 },
  { id: 'plant', price: 18 },
];

const IDS: ReadonlyArray<string> = PRODUCTS.map((product) => product.id);

function isId(value: unknown): value is Id {
  return typeof value === 'string' && IDS.includes(value);
}

const ICONS = { mug: CoffeeIcon, notebook: NotebookPenIcon, plant: SproutIcon } as const;

function nameOf(id: Id): string {
  return { mug: m.storage_mug, notebook: m.storage_notebook, plant: m.storage_plant }[id]();
}

const transition = {
  transitionDuration: { default: '160ms', [LESS_MOTION]: '0s' },
  transitionTimingFunction: 'ease-out',
} as const;

const styles = create({
  actions: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s1,
    justifyContent: 'space-between',
  },
  add: {
    columnGap: 2,
    flexGrow: 1,
    fontSize: font.sizeXs,
    paddingInline: 6,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: SCENE.badge,
    borderRadius: 999,
    color: SCENE.onBadge,
    display: 'flex',
    fontFamily: font.mono,
    fontSize: '0.625rem',
    height: 14,
    insetBlockStart: -5,
    insetInlineEnd: -7,
    justifyContent: 'center',
    lineHeight: 1,
    minWidth: 14,
    paddingInline: 3,
    position: 'absolute',
  },
  bag: { position: 'relative' },
  banner: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.base,
    boxShadow: shadow.lift,
    columnGap: spacing.s2,
    display: 'flex',
    flexWrap: 'wrap',
    padding: spacing.s2,
    rowGap: 6,
  },
  bannerText: {
    alignItems: 'center',
    display: 'flex',
    flexBasis: '12rem',
    flexGrow: 1,
    gap: 6,
    margin: 0,
  },
  between: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s2,
    justifyContent: 'space-between',
  },
  choice: {
    borderRadius: radius.base,
    fontSize: font.sizeXs,
    paddingBlock: 2,
    paddingInline: spacing.s2,
  },
  choiceInk: { backgroundColor: colors.fg, color: colors.bg },
  choiceQuiet: { backgroundColor: { ':hover': colors.border, default: colors.track } },
  choices: { display: 'flex', gap: 6 },
  // The heart and the cart's controls: small, on the card ground.
  control: {
    backgroundColor: { ':hover': colors.track, default: colors.card },
    borderRadius: radius.base,
    height: 24,
    transitionProperty: 'background-color, color',
    ...transition,
  },
  heart: { color: colors.muted },
  hearted: { color: SCENE.heart },
  inline: {
    alignItems: 'center',
    display: 'flex',
    gap: 6,
    minWidth: 0,
  },
  knob: {
    backgroundColor: SCENE.knob,
    borderRadius: '50%',
    boxShadow: SCENE.knobShadow,
    height: 12,
    transform: 'translateX(0)',
    transitionProperty: 'transform',
    width: 12,
    ...transition,
  },
  knobOn: { transform: { ':dir(rtl)': 'translateX(-12px)', default: 'translateX(12px)' } },
  label: {
    alignItems: 'baseline',
    columnGap: spacing.s1,
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  layout: {
    alignItems: 'start',
    display: 'grid',
    gap: spacing.s3,
    gridTemplateColumns: { default: '1fr', [WIDE]: 'minmax(0, 3fr) minmax(0, 2fr)' },
  },
  mug: {
    backgroundColor: `color-mix(in srgb, ${SCENE.mug} 16%, ${colors.raised})`,
    color: SCENE.mug,
  },
  muted: { color: colors.muted },
  name: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  notebook: {
    backgroundColor: `color-mix(in srgb, ${SCENE.notebook} 16%, ${colors.raised})`,
    color: SCENE.notebook,
  },
  num: { fontFamily: font.mono, fontVariantNumeric: 'tabular-nums' },
  plant: {
    backgroundColor: `color-mix(in srgb, ${SCENE.plant} 16%, ${colors.raised})`,
    color: SCENE.plant,
  },
  // A scene's own button: no chrome of its own, the page's focus ring.
  press: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    color: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    justifyContent: 'center',
    lineHeight: 'inherit',
    outlineColor: colors.muted,
    outlineOffset: 2,
    outlineStyle: { ':focus-visible': 'solid', default: 'none' },
    outlineWidth: 1,
    padding: 0,
  },
  product: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  products: {
    display: 'grid',
    gap: spacing.s2,
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  // The shelves under the products: what this tab saw and what is kept for later.
  shelf: {
    alignItems: 'center',
    columnGap: spacing.s2,
    display: 'flex',
    minHeight: 20,
  },
  shelfName: {
    color: colors.muted,
    flexShrink: 0,
    fontSize: font.sizeXs,
    width: '7.5rem',
  },
  // The shop sits on the raised ground inside the card, a step in from its corners.
  shop: {
    backgroundColor: colors.raised,
    borderRadius: radius.base,
    display: 'flex',
    flexDirection: 'column',
    fontSize: '0.8125rem',
    gap: 10,
    lineHeight: 1.4,
    padding: 10,
  },
  side: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.s2,
    minWidth: 0,
  },
  small: { color: colors.muted, fontSize: font.sizeXs },
  square: { flexShrink: 0, width: 24 },
  step: {
    borderRadius: radius.base,
    color: colors.muted,
    height: 24,
    width: 22,
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.base,
    display: 'flex',
    flexGrow: 1,
    height: 24,
    justifyContent: 'space-between',
  },
  switch: {
    backgroundColor: colors.track,
    borderRadius: 999,
    flexShrink: 0,
    height: 16,
    justifyContent: 'flex-start',
    paddingInline: 2,
    transitionProperty: 'background-color',
    width: 28,
    ...transition,
  },
  switchOn: { backgroundColor: SCENE.badge },
  thumb: {
    alignItems: 'center',
    borderRadius: radius.base,
    display: 'flex',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  thumbs: {
    alignItems: 'center',
    display: 'flex',
    gap: spacing.s1,
    listStyle: 'none',
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
  tile: {
    borderRadius: radius.base,
    height: '3.5rem',
    transform: { ':active': 'scale(0.97)', default: 'none' },
    transitionProperty: 'transform',
    width: '100%',
    ...transition,
  },
});

type Shop = {
  /** How many of each product the cart holds. */
  readonly cart: Readonly<Partial<Record<Id, number>>>;
  /** What the visitor chose on the cookie banner, null before they chose. */
  readonly consent: string | null;
  /** The cached requests' paths. */
  readonly offline: ReadonlyArray<string>;
  /** The products' prices, as the page's language writes them. */
  readonly prices: ReadonlyArray<string>;
  /** Saved for later, oldest first. */
  readonly saved: ReadonlyArray<Id>;
  /** Seen in this tab, newest first. */
  readonly viewed: ReadonlyArray<Id>;
};

const stored = held<Shop | null>(null);

function parsed(text: string | null): unknown {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function webItem(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

/** The cart as `[{ "id": "mug", "qty": 2 }]`, the way a shop keeps it. Anything else reads as empty. */
function readCart(): Partial<Record<Id, number>> {
  const lines = parsed(webItem(() => localStorage, CART));
  const cart: Partial<Record<Id, number>> = {};
  if (!Array.isArray(lines)) {
    return cart;
  }
  for (const line of lines as Array<unknown>) {
    if (typeof line !== 'object' || line === null) {
      continue;
    }
    const { id, qty } = line as { id?: unknown; qty?: unknown };
    if (isId(id) && typeof qty === 'number' && Number.isSafeInteger(qty) && qty > 0) {
      cart[id] = (cart[id] ?? 0) + qty;
    }
  }
  return cart;
}

function readViewed(): Array<Id> {
  const list = parsed(webItem(() => sessionStorage, VIEWED));
  return Array.isArray(list) ? [...new Set((list as Array<unknown>).filter(isId))] : [];
}

function readConsent(): string | null {
  try {
    const pair = document.cookie.split('; ').find((item) => item.startsWith(`${CONSENT}=`));
    return pair === undefined ? null : decodeURIComponent(pair.slice(CONSENT.length + 1));
  } catch {
    return null;
  }
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error ?? new Error('indexedDB')));
  });
}

/**
 * The shop's database, made on the way where `create` allows it. A read never
 * makes one: a database the panel just deleted stays deleted. The connection
 * closes itself when anything asks to delete the database, so a clear is never
 * held up.
 */
async function openDatabase(create: boolean): Promise<IDBDatabase | null> {
  const opening = indexedDB.open(NAME, VERSION);
  opening.addEventListener('upgradeneeded', () => {
    if (!create) {
      opening.transaction?.abort();
      return;
    }
    const database = opening.result;
    // The old demo's store, from before the shop.
    if (database.objectStoreNames.contains('counts')) {
      database.deleteObjectStore('counts');
    }
    if (!database.objectStoreNames.contains(SAVED)) {
      database.createObjectStore(SAVED, { keyPath: 'id' });
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

async function readSaved(): Promise<Array<Id>> {
  const database = await openDatabase(false);
  if (database === null) {
    return [];
  }
  try {
    const records = await done(database.transaction(SAVED).objectStore(SAVED).getAll());
    return (records as Array<{ id?: unknown; savedAt?: unknown }>)
      .toSorted((one, two) => String(one.savedAt).localeCompare(String(two.savedAt)))
      .map((record) => record.id)
      .filter(isId);
  } catch {
    return [];
  } finally {
    database.close();
  }
}

async function readOffline(): Promise<Array<string>> {
  try {
    if (!(await caches.has(NAME))) {
      return [];
    }
    const requests = await (await caches.open(NAME)).keys();
    return requests.map((request) => new URL(request.url).pathname);
  } catch {
    return [];
  }
}

/** Reads every store again, as the page finds it now. */
async function readAll(): Promise<void> {
  const [saved, offline] = await Promise.all([readSaved(), readOffline()]);
  const next: Shop = {
    cart: readCart(),
    consent: readConsent(),
    offline,
    prices: PRODUCTS.map(({ price }) =>
      or(() =>
        new Intl.NumberFormat(undefined, {
          currency: 'EUR',
          maximumFractionDigits: 0,
          style: 'currency',
        }).format(price),
      ),
    ),
    saved,
    viewed: readViewed(),
  };
  const last = stored.read();
  if (last === null || JSON.stringify(last) !== JSON.stringify(next)) {
    stored.set(next);
  }
}

function setCart(id: Id, change: number): void {
  const cart = readCart();
  cart[id] = Math.max(0, (cart[id] ?? 0) + change);
  const lines = PRODUCTS.flatMap((product) => {
    const qty = cart[product.id] ?? 0;
    return qty > 0 ? [{ id: product.id, qty }] : [];
  });
  if (lines.length === 0) {
    localStorage.removeItem(CART);
  } else {
    localStorage.setItem(CART, JSON.stringify(lines));
  }
}

function view(id: Id): void {
  const viewed = [id, ...readViewed().filter((other) => other !== id)];
  sessionStorage.setItem(VIEWED, JSON.stringify(viewed));
}

function consent(choice: 'all' | 'essential'): void {
  document.cookie = `${CONSENT}=${choice}; path=/; max-age=${CONSENT_MAX_AGE}; samesite=lax`;
}

async function toggleSaved(id: Id): Promise<void> {
  const database = await openDatabase(true);
  if (database === null) {
    return;
  }
  try {
    const store = database.transaction(SAVED, 'readwrite').objectStore(SAVED);
    const record: unknown = await done(store.get(id));
    if (record === undefined) {
      await done(store.put({ id, name: nameOf(id), savedAt: new Date().toISOString() }));
    } else {
      await done(store.delete(id));
    }
  } finally {
    database.close();
  }
}

async function toggleOffline(on: boolean): Promise<void> {
  if (on) {
    await (await caches.open(NAME)).addAll(OFFLINE);
  } else {
    await caches.delete(NAME);
  }
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

// Holds a line's height until the page has read its value.
const EMPTY = ' ';

function ProductIcon({ id, size }: { id: Id; size: number }) {
  const Icon = ICONS[id];
  return <Icon {...ICON} size={size} />;
}

function Shelf({ items, label, none }: { items: ReadonlyArray<Id>; label: string; none: string }) {
  return (
    <div {...props(styles.shelf)}>
      <span {...props(styles.shelfName)}>{label}</span>
      {items.length === 0 ? (
        <span {...props(styles.small)}>{none}</span>
      ) : (
        <ul {...props(styles.thumbs)} aria-label={label}>
          {items.map((id) => (
            <li {...props(styles.thumb, styles[id])} key={id}>
              <span aria-label={nameOf(id)} role="img" title={nameOf(id)}>
                <ProductIcon id={id} size={12} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What a store holds for the shop, in a line, or that it holds nothing. */
function readout(items: ReadonlyArray<string> | null): string | null {
  if (items === null) {
    return null;
  }
  return items.length === 0 ? m.storage_empty() : items.join(', ');
}

function Product({
  id,
  price,
  qty,
  saved,
}: {
  id: Id;
  price: ReactNode;
  qty: number;
  saved: boolean;
}) {
  const name = nameOf(id);
  const plus = useRef<HTMLButtonElement>(null);
  const takeOne = () => {
    write(() => {
      setCart(id, -1);
      // The minus goes with the last one: focus moves to the plus, not the page.
      if ((readCart()[id] ?? 0) === 0) {
        plus.current?.focus();
      }
    })();
  };
  return (
    <li {...props(styles.product)}>
      <button
        {...props(styles.press, styles.tile, styles[id])}
        aria-label={m.storage_view({ name })}
        onClick={write(() => view(id))}
        type="button"
      >
        <ProductIcon id={id} size={22} />
      </button>
      <div {...props(styles.label)}>
        <span {...props(styles.name)}>{name}</span>
        <span {...props(styles.small, styles.num)}>{price}</span>
      </div>
      <div {...props(styles.actions)}>
        <button
          {...props(
            styles.press,
            styles.control,
            styles.square,
            saved ? styles.hearted : styles.heart,
          )}
          aria-label={m.storage_save({ name })}
          aria-pressed={saved}
          onClick={write(() => toggleSaved(id))}
          type="button"
        >
          <HeartIcon {...ICON} fill={saved ? 'currentColor' : 'none'} size={14} />
        </button>
        {/* One stepper at every count, so the plus is the same button and keeps its focus. */}
        <div {...props(styles.stepper)}>
          {qty > 0 && (
            <button
              {...props(styles.press, styles.step)}
              aria-label={m.storage_remove({ name })}
              onClick={takeOne}
              type="button"
            >
              <MinusIcon {...ICON} size={12} />
            </button>
          )}
          {qty > 0 && (
            <span {...props(styles.num)} aria-live="polite">
              {qty}
            </span>
          )}
          <button
            {...props(
              styles.press,
              qty === 0 ? styles.control : styles.step,
              qty === 0 && styles.add,
            )}
            aria-label={m.storage_add({ name })}
            onClick={write(() => setCart(id, 1))}
            ref={plus}
            type="button"
          >
            <PlusIcon {...ICON} size={12} />
            {qty === 0 && m.storage_add_short()}
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * A small shop that keeps what a real one keeps, each where real sites keep
 * it: the cart in local storage, what this tab saw in session storage, the
 * cookie banner's answer in a cookie, the saved list in IndexedDB and an
 * offline copy in Cache Storage. It reads them back while in view, so an edit
 * or a clear in the panel's storage view shows here.
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
  const cart = read?.cart ?? {};
  const count = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const saved = read?.saved ?? [];
  const offline = (read?.offline.length ?? 0) > 0;
  return (
    <Card ref={card} title={m.knob_storage()} wide>
      <div {...props(styles.layout)}>
        <div {...props(styles.shop)}>
          <div {...props(styles.between)}>
            <span {...props(styles.inline)}>
              <StoreIcon {...ICON} {...props(styles.muted)} />
              {m.storage_shop()}
            </span>
            <span
              {...props(styles.bag)}
              aria-label={m.storage_cart({ count: String(count) })}
              role="status"
            >
              <ShoppingBagIcon {...ICON} />
              {count > 0 ? (
                <span {...props(styles.badge)} aria-hidden="true">
                  {count}
                </span>
              ) : null}
            </span>
          </div>
          <ul {...props(styles.products)}>
            {PRODUCTS.map(({ id }, index) => (
              <Product
                id={id}
                key={id}
                price={read?.prices[index] ?? EMPTY}
                qty={cart[id] ?? 0}
                saved={saved.includes(id)}
              />
            ))}
          </ul>
          <div>
            <Shelf
              items={read?.viewed ?? []}
              label={m.storage_viewed()}
              none={m.storage_viewed_none()}
            />
            <Shelf items={saved} label={m.storage_saved()} none={m.storage_saved_none()} />
          </div>
          <div {...props(styles.between)}>
            <span {...props(styles.inline)}>
              {offline ? (
                <CloudCheckIcon {...ICON} {...props(styles.muted)} />
              ) : (
                <CloudDownloadIcon {...ICON} {...props(styles.muted)} />
              )}
              <span>{m.storage_offline()}</span>
            </span>
            <button
              {...props(styles.press, styles.switch, offline && styles.switchOn)}
              aria-checked={offline}
              aria-label={m.storage_offline()}
              onClick={write(() => toggleOffline(!offline))}
              role="switch"
              type="button"
            >
              <span {...props(styles.knob, offline && styles.knobOn)} />
            </button>
          </div>
          {read?.consent == null ? (
            <div {...props(styles.banner)} aria-label={m.storage_cookies()} role="region">
              <p {...props(styles.bannerText)}>
                <CookieIcon {...ICON} {...props(styles.muted)} />
                {m.storage_cookie_text()}
              </p>
              <div {...props(styles.choices)}>
                <button
                  {...props(styles.press, styles.choice, styles.choiceQuiet)}
                  onClick={write(() => consent('essential'))}
                  type="button"
                >
                  {m.storage_cookie_essential()}
                </button>
                <button
                  {...props(styles.press, styles.choice, styles.choiceInk)}
                  onClick={write(() => consent('all'))}
                  type="button"
                >
                  {m.storage_cookie_accept()}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div {...props(styles.side)}>
          <Line>{withKeys(m.storage_hint())}</Line>
          <Rows>
            <Row
              name={m.storage_local()}
              value={readout(
                read === null
                  ? null
                  : PRODUCTS.flatMap(({ id }) => {
                      const qty = cart[id] ?? 0;
                      return qty > 0 ? [`${id} × ${qty}`] : [];
                    }),
              )}
            />
            <Row name={m.storage_session()} value={readout(read?.viewed ?? null)} />
            <Row
              name={m.storage_cookie()}
              value={readout(read === null ? null : read.consent === null ? [] : [read.consent])}
            />
            <Row name={m.storage_database()} value={readout(read?.saved ?? null)} />
            <Row
              name={m.storage_cache()}
              value={readout(read?.offline.map((path) => path.split('/').at(-1) ?? path) ?? null)}
            />
          </Rows>
        </div>
      </div>
    </Card>
  );
}
