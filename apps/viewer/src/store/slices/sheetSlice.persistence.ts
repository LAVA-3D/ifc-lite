/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Versioned sheet storage (#4836): model sheets and the global template library. */
import type { DrawingSheet } from '@ifc-lite/drawing-2d';
import { record, restoreSheet } from './sheetSlice.validation';

const PREFIX = 'ifc-lite:drawing-sheet:v1:';
export const SHEET_TEMPLATES_KEY = 'ifc-lite:sheet-templates:v1';
const MAX_MODELS = 20;
export const sheetStorageKey = (hash: string): string => `${PREFIX}${hash}`;

function read(key: string): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    const value = localStorage.getItem(key);
    return value === null ? null : JSON.parse(value);
  } catch (error) {
    console.warn('[sheet] Could not read saved sheet setup', error);
    return null;
  }
}

export function loadSheet(hash: string): DrawingSheet | null {
  const entry = record(read(sheetStorageKey(hash)));
  return restoreSheet(entry.sheet);
}

export function loadSheetTemplates(): DrawingSheet[] {
  const entry = record(read(SHEET_TEMPLATES_KEY));
  return Array.isArray(entry.templates)
    ? entry.templates.map(restoreSheet).filter((sheet) => sheet !== null) : [];
}

/** A failed write leaves the previous successful entry intact, including its logo. */
function write(key: string, value: unknown): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('[sheet] Could not save sheet setup (browser storage may be full)', error);
    return false;
  }
}

export function saveSheetTemplates(templates: readonly DrawingSheet[]): void {
  write(SHEET_TEMPLATES_KEY, { templates });
}

function nextSaveOrder(): number {
  if (typeof localStorage === 'undefined') return Date.now();
  try {
    let latest = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const candidate = localStorage.key(i);
      if (!candidate?.startsWith(PREFIX)) continue;
      const entry = record(read(candidate));
      const order = typeof entry.savedOrder === 'number'
        ? entry.savedOrder
        : typeof entry.savedAt === 'number' ? entry.savedAt : 0;
      latest = Math.max(latest, order);
    }
    return Math.max(Date.now(), latest + 1);
  } catch (error) {
    console.warn('[sheet] Could not inspect saved sheet order', error);
    return Date.now();
  }
}

export function saveSheet(hash: string, sheet: DrawingSheet | null): void {
  const key = sheetStorageKey(hash);
  if (sheet === null) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch (error) {
      console.warn('[sheet] Could not clear saved sheet setup', error);
    }
    return;
  }
  const savedAt = Date.now();
  if (!write(key, { sheet, savedAt, savedOrder: nextSaveOrder() })) return;
  // Match the drawing markup cache's 20-model limit. Templates are never evicted.
  try {
    const entries: { key: string; savedOrder: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const candidate = localStorage.key(i);
      if (!candidate?.startsWith(PREFIX)) continue;
      const entry = record(read(candidate));
      entries.push({
        key: candidate,
        savedOrder: typeof entry.savedOrder === 'number'
          ? entry.savedOrder
          : typeof entry.savedAt === 'number' ? entry.savedAt : 0,
      });
    }
    entries.sort((a, b) => a.savedOrder - b.savedOrder || a.key.localeCompare(b.key));
    for (const entry of entries.filter((entry) => entry.key !== key).slice(0, Math.max(0, entries.length - MAX_MODELS))) {
      localStorage.removeItem(entry.key);
    }
  } catch (error) {
    console.warn('[sheet] Could not prune old saved sheets', error);
  }
}
