import { props } from '@stylexjs/stylex';
import { LanguagesIcon } from 'lucide-react';
import { m } from '../paraglide/messages.js';
import { wordsFor } from './receipt-words.ts';
import { BLANK, cardStyles, Chip, Row, Specimen, useReading } from './specimen.tsx';

type Receipt = {
  count: string;
  date: string;
  delivered: string;
  greeting: string;
  lines: ReadonlyArray<{ name: string; price: string }>;
  packed: string;
  tag: string;
  total: string;
  totalLabel: string;
};

// The rows a receipt has before it is read, so the card is its full height.
const LINES = [0, 1, 2] as const;

/**
 * An order receipt the way an app writes one: the language from
 * `navigator.language`, and every date, price, plural and list from `Intl`.
 */
function readReceipt(): Receipt {
  const { tag, words } = wordsFor(navigator.language);
  const money = new Intl.NumberFormat(tag, { currency: words.currency, style: 'currency' });
  const count = words.items.length;
  const form = words.count[new Intl.PluralRules(tag).select(count)] ?? words.count.other;
  return {
    count: form.replace('{n}', new Intl.NumberFormat(tag).format(count)),
    date: new Intl.DateTimeFormat(tag, { dateStyle: 'long' }).format(new Date()),
    delivered: words.delivered.replace(
      '{ago}',
      new Intl.RelativeTimeFormat(tag, { numeric: 'always' }).format(-2, 'hour'),
    ),
    greeting: words.greeting,
    lines: words.items.map(({ name, price }) => ({ name, price: money.format(price) })),
    packed: words.packed.replace(
      '{names}',
      new Intl.ListFormat(tag, { type: 'conjunction' }).format(words.people),
    ),
    tag,
    total: money.format(words.items.reduce((sum, { price }) => sum + price, 0)),
    totalLabel: words.total,
  };
}

export function LanguageSpecimen() {
  const receipt = useReading(readReceipt);
  return (
    <Specimen
      chips={
        <>
          <Chip demo="turkish" label={m.try_turkish()} />
          <Chip demo="german" label={m.try_german()} />
          <Chip demo="french" label={m.try_french()} />
          <Chip demo="spanish" label={m.try_spanish()} />
          <Chip demo="japanese" label={m.try_japanese()} />
          <Chip demo="arabic" label={m.try_arabic()} />
          <Chip demo="pseudo" label={m.try_pseudo()} />
        </>
      }
      icon={LanguagesIcon}
      label={m.try_language()}
    >
      <div {...props(cardStyles.card)} lang={receipt?.tag}>
        <Row start={receipt?.greeting ?? BLANK} />
        <Row quiet start={receipt?.date ?? BLANK} />
        {LINES.map((line) => (
          <Row
            end={receipt?.lines[line]?.price ?? BLANK}
            key={line}
            start={receipt?.lines[line]?.name ?? BLANK}
          />
        ))}
        <div {...props(cardStyles.rule)} />
        <Row
          end={receipt?.total ?? BLANK}
          start={
            receipt === null ? (
              BLANK
            ) : (
              <>
                {receipt.totalLabel}
                <span {...props(cardStyles.quiet)}>
                  {' · '}
                  {receipt.count}
                </span>
              </>
            )
          }
        />
        <Row quiet start={receipt?.delivered ?? BLANK} />
        <Row quiet start={receipt?.packed ?? BLANK} />
      </div>
    </Specimen>
  );
}
