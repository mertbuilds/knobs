import { m } from '../paraglide/messages.js';

/** What `format` gives, or the page's word for something this browser does not report. */
export function or(format: () => string): string {
  try {
    return format();
  } catch {
    return m.read_none();
  }
}

/** A number with its unit written in full, as the language says it: `50 milliseconds`. */
export function unit(value: number, name: string, digits = 0): string {
  return or(() =>
    new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits,
      style: 'unit',
      unit: name,
      unitDisplay: 'long',
    }).format(value),
  );
}
