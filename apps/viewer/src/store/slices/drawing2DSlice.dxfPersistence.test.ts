/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// fake-indexeddb installs a Node-compatible IDB implementation on
// `globalThis.indexedDB` when imported via the `/auto` entry point — the
// same convention `services/extensions/idb-storage.test.ts` uses.
import 'fake-indexeddb/auto';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDxfUnderlaysEntry,
  saveDxfUnderlaysEntry,
  mergeDxfUnderlays,
  clearAllDxfUnderlaysEntries,
  __resetDxfUnderlaysDbForTests,
} from './drawing2DSlice.dxfPersistence.js';
import type { DxfUnderlayState } from './drawing2DSlice.js';
import type { DxfUnderlay } from '@ifc-lite/drawing-2d';

function sampleUnderlay(name = 'plan.dxf'): DxfUnderlay {
  return {
    name,
    layers: [{ name: '0', color: '#000000', visible: true, paths: [], fills: [], texts: [] }],
    bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
    unitScale: 1,
    skipped: {},
    warnings: [],
  };
}

function sampleEntry(id = 'dxf-1'): DxfUnderlayState {
  return {
    id,
    name: 'plan.dxf',
    underlay: sampleUnderlay(),
    visible: true,
    visible3D: true,
    opacity: 1,
    layerVisibility: { '0': true },
    placement: { offsetX: 0, offsetY: 0, rotationDeg: 0, scale: 1 },
    georeferenced: false,
  };
}

beforeEach(async () => {
  __resetDxfUnderlaysDbForTests();
  await clearAllDxfUnderlaysEntries();
});

afterEach(async () => {
  await clearAllDxfUnderlaysEntries();
});

describe('drawing2DSlice.dxfPersistence — save/load round trip', () => {
  it('saves and loads back the full dxfUnderlays array for a model hash', async () => {
    const entry = sampleEntry('dxf-round-trip');
    await saveDxfUnderlaysEntry('hash-a', [entry]);

    const loaded = await loadDxfUnderlaysEntry('hash-a');
    assert.ok(loaded, 'expected a saved entry to load back');
    assert.strictEqual(loaded!.dxfUnderlays.length, 1);
    assert.deepStrictEqual(loaded!.dxfUnderlays[0], entry);
  });

  it('keeps different model hashes independent', async () => {
    await saveDxfUnderlaysEntry('hash-a', [sampleEntry('a1')]);
    await saveDxfUnderlaysEntry('hash-b', [sampleEntry('b1')]);

    const a = await loadDxfUnderlaysEntry('hash-a');
    const b = await loadDxfUnderlaysEntry('hash-b');
    assert.strictEqual(a!.dxfUnderlays[0].id, 'a1');
    assert.strictEqual(b!.dxfUnderlays[0].id, 'b1');
  });
});

// MUTATION TARGET: empty-vs-absent distinction (requirement #2). If
// `loadDxfUnderlaysEntry` ever collapsed "nothing saved" and "saved as []"
// into the same return value, this pair of assertions would no longer
// distinguish them.
describe('drawing2DSlice.dxfPersistence — empty vs. absent', () => {
  it('returns null for a hash nothing was ever saved under', async () => {
    const loaded = await loadDxfUnderlaysEntry('never-saved-hash');
    assert.strictEqual(loaded, null);
  });

  it('returns a real entry with an empty array when [] was explicitly saved', async () => {
    await saveDxfUnderlaysEntry('hash-explicit-empty', []);
    const loaded = await loadDxfUnderlaysEntry('hash-explicit-empty');
    assert.notStrictEqual(loaded, null, 'an explicit empty save must be distinguishable from nothing saved');
    assert.deepStrictEqual(loaded!.dxfUnderlays, []);
  });
});

describe('drawing2DSlice.dxfPersistence — malformed-entry skipping', () => {
  it('drops a malformed individual underlay entry but keeps valid siblings in the same save', async () => {
    const good = sampleEntry('good-1');
    const bad = { ...sampleEntry('bad-1'), placement: { offsetX: 'not-a-number' } } as unknown as DxfUnderlayState;
    await saveDxfUnderlaysEntry('hash-mixed', [good, bad]);

    const loaded = await loadDxfUnderlaysEntry('hash-mixed');
    assert.ok(loaded);
    assert.deepStrictEqual(loaded!.dxfUnderlays.map((u) => u.id), ['good-1']);
  });

  it('returns null for a stored value whose container shape is corrupt (not just individual entries)', async () => {
    // saveDxfUnderlaysEntry can never itself write a corrupt container —
    // write one directly through the raw IndexedDB API (available here via
    // fake-indexeddb) to exercise `isValidStoredEntry`'s rejection path.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ifc-lite-drawing2d-dxf', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('dxf-underlays', 'readwrite');
      tx.objectStore('dxf-underlays').put({ savedAt: 'not-a-number', dxfUnderlays: 'not-an-array' }, 'hash-corrupt-container');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const loaded = await loadDxfUnderlaysEntry('hash-corrupt-container');
    assert.strictEqual(loaded, null, 'a corrupt container shape must degrade to null, not throw or return partial data');
  });
});

describe('drawing2DSlice.dxfPersistence — eviction beyond MAX_ENTRIES', () => {
  it('evicts the oldest entries once more than 20 distinct model hashes are saved', async () => {
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await saveDxfUnderlaysEntry(`hash-${i}`, [sampleEntry(`u-${i}`)]);
    }

    const oldest = await loadDxfUnderlaysEntry('hash-0');
    const newest = await loadDxfUnderlaysEntry('hash-24');
    assert.strictEqual(oldest, null, 'the oldest entries must be evicted past the 20-entry cap');
    assert.ok(newest, 'the most recently saved entry must survive eviction');
  });
});

describe('drawing2DSlice.dxfPersistence — mergeDxfUnderlays (additive restore)', () => {
  it('adds a saved entry whose id is not already present', () => {
    const existing = [sampleEntry('live-1')];
    const saved = [sampleEntry('saved-1')];
    const merged = mergeDxfUnderlays(existing, saved);
    assert.deepStrictEqual(merged.map((u) => u.id).sort(), ['live-1', 'saved-1']);
  });

  it('never overwrites or duplicates an id already present in the live array', () => {
    const existing = [{ ...sampleEntry('shared'), opacity: 0.4 }];
    const saved = [{ ...sampleEntry('shared'), opacity: 0.9 }];
    const merged = mergeDxfUnderlays(existing, saved);
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].opacity, 0.4, 'the live entry must win over a saved one sharing its id');
  });

  it('returns the SAME array reference when the saved array is empty (no-op merge)', () => {
    const existing = [sampleEntry('live-1')];
    const merged = mergeDxfUnderlays(existing, []);
    assert.strictEqual(merged, existing);
  });

  it('returns the SAME array reference when every saved id is already present', () => {
    const existing = [sampleEntry('dup')];
    const merged = mergeDxfUnderlays(existing, [sampleEntry('dup')]);
    assert.strictEqual(merged, existing);
  });
});
