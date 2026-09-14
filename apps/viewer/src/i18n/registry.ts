/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Locale registry (#4785). English ships in-tree as the only locale and
 * the default; other locales register here as a `Partial<Catalogue>`
 * overlay — nothing in this module or in `useTranslation` requires a
 * locale to cover every key.
 *
 * This is a plain module-level store (subscribe/getSnapshot,
 * `useSyncExternalStore`-shaped) rather than a slice on the main viewer
 * store: the locale is UI chrome, not model or scene state, and keeping
 * it separate means converting a component to translated strings never
 * has to touch the (already large) viewer store.
 */
import { en, type TranslationKey } from './en';

export type Locale = string;
export type Catalogue = Partial<Record<TranslationKey, string>>;

const catalogues = new Map<Locale, Catalogue>([['en', en]]);
let activeLocale: Locale = 'en';
const listeners = new Set<() => void>();

/** Register (or replace) the catalogue for a locale. English cannot be replaced. */
export function registerLocale(locale: Locale, catalogue: Catalogue): void {
  if (locale === 'en') {
    throw new Error('the "en" catalogue is the fallback and cannot be overridden');
  }
  catalogues.set(locale, catalogue);
}

/** Switch the active locale. Falls back to 'en' if the locale was never registered. */
export function setLocale(locale: Locale): void {
  activeLocale = catalogues.has(locale) ? locale : 'en';
  for (const listener of listeners) listener();
}

export function getLocale(): Locale {
  return activeLocale;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Resolve one key against the active locale, falling back to English when
 * the active catalogue does not have the key. A registered locale that
 * explicitly maps a key to `''` gets that empty string back — only an
 * *absent* key (not an empty translation) falls back, so a missing
 * translation is never silently indistinguishable from a deliberately
 * blank one.
 */
export function resolve(key: TranslationKey): string {
  const catalogue = catalogues.get(activeLocale);
  const value = catalogue?.[key];
  return value !== undefined ? value : en[key];
}
