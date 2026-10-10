/**
 * The fixed words of the receipt specimen, per language. These are specimen
 * data, not site copy: the receipt has to speak the language the page reads,
 * and the site's own messages exist in English only. So they live here and not
 * in `messages/en.json`.
 */
export type ReceiptWords = {
  /** The item count per plural category, with `{n}` for the number. */
  count: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
  /** The currency a shop in this language most likely charges in. */
  currency: string;
  /** With `{ago}` for the relative time. */
  delivered: string;
  greeting: string;
  items: ReadonlyArray<{ name: string; price: number }>;
  /** With `{names}` for the list of people. */
  packed: string;
  people: ReadonlyArray<string>;
  total: string;
};

const en: ReceiptWords = {
  count: { one: '{n} item', other: '{n} items' },
  currency: 'USD',
  delivered: 'Delivered {ago}',
  greeting: 'Hello Grace, thanks for your order',
  items: [
    { name: 'Coffee beans', price: 14.5 },
    { name: 'Oat milk', price: 4.25 },
    { name: 'Paper filters', price: 6 },
  ],
  packed: 'Packed by {names}',
  people: ['Maya', 'Tom', 'Priya'],
  total: 'Total',
};

const WORDS: Record<string, ReceiptWords> = {
  ar: {
    count: {
      few: '{n} منتجات',
      many: '{n} منتجًا',
      one: 'منتج واحد',
      other: '{n} منتج',
      two: 'منتجان',
      zero: 'لا منتجات',
    },
    currency: 'SAR',
    delivered: 'تم التوصيل {ago}',
    greeting: 'مرحبًا سارة، شكرًا على طلبك',
    items: [
      { name: 'حبوب قهوة', price: 55 },
      { name: 'حليب الشوفان', price: 16 },
      { name: 'فلاتر ورقية', price: 22 },
    ],
    packed: 'جهّز طلبك {names}',
    people: ['ليلى', 'عمر', 'نور'],
    total: 'الإجمالي',
  },
  de: {
    count: { one: '{n} Artikel', other: '{n} Artikel' },
    currency: 'EUR',
    delivered: 'Geliefert {ago}',
    greeting: 'Hallo Anna, danke für deine Bestellung',
    items: [
      { name: 'Kaffeebohnen', price: 12.9 },
      { name: 'Haferdrink', price: 2.49 },
      { name: 'Papierfilter', price: 4.5 },
    ],
    packed: 'Verpackt von {names}',
    people: ['Lena', 'Jonas', 'Mia'],
    total: 'Summe',
  },
  en,
  es: {
    count: { one: '{n} artículo', other: '{n} artículos' },
    currency: 'EUR',
    delivered: 'Entregado {ago}',
    greeting: 'Hola Carmen, gracias por tu pedido',
    items: [
      { name: 'Café en grano', price: 11.9 },
      { name: 'Bebida de avena', price: 2.35 },
      { name: 'Filtros de papel', price: 4.2 },
    ],
    packed: 'Preparado por {names}',
    people: ['Lucía', 'Mateo', 'Sofía'],
    total: 'Total',
  },
  fr: {
    count: { one: '{n} article', other: '{n} articles' },
    currency: 'EUR',
    delivered: 'Livrée {ago}',
    greeting: 'Bonjour Camille, merci pour votre commande',
    items: [
      { name: 'Café en grains', price: 12.5 },
      { name: 'Boisson à l’avoine', price: 2.6 },
      { name: 'Filtres en papier', price: 4.4 },
    ],
    packed: 'Préparée par {names}',
    people: ['Léa', 'Hugo', 'Chloé'],
    total: 'Total',
  },
  ja: {
    count: { other: '{n}点' },
    currency: 'JPY',
    delivered: '{ago}に配達済み',
    greeting: 'さくら様、ご注文ありがとうございます',
    items: [
      { name: 'コーヒー豆', price: 1800 },
      { name: 'オーツミルク', price: 420 },
      { name: 'ペーパーフィルター', price: 550 },
    ],
    packed: '梱包担当：{names}',
    people: ['陽菜', '蓮', '結衣'],
    total: '合計',
  },
  tr: {
    count: { one: '{n} ürün', other: '{n} ürün' },
    currency: 'TRY',
    delivered: '{ago} teslim edildi',
    greeting: 'Merhaba Elif, siparişin için teşekkürler',
    items: [
      { name: 'Kahve çekirdeği', price: 420 },
      { name: 'Yulaf sütü', price: 95 },
      { name: 'Kağıt filtre', price: 140 },
    ],
    packed: 'Hazırlayanlar: {names}',
    people: ['Deniz', 'Can', 'Zeynep'],
    total: 'Toplam',
  },
};

/**
 * The words for a language tag and the tag to format with. A language the
 * receipt does not speak gets English words and English formats, the way an
 * app falls back to a language it ships.
 */
export function wordsFor(tag: string): { tag: string; words: ReceiptWords } {
  const words = WORDS[tag.split('-')[0]?.toLowerCase() ?? ''];
  return words === undefined ? { tag: 'en', words: en } : { tag, words };
}
