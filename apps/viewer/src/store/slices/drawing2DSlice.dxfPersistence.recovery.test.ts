/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Isolated in its own file (own child process under the node test runner —
 * see `services/extensions/idb-storage.recovery.test.ts`'s identical note)
 * so this module's `dbPromise` singleton starts genuinely unset, and so the
 * "storage unavailable" test below can delete `globalThis.indexedDB`
 * without breaking every other test file that expects it present.
 */

import 'fake-indexeddb/auto';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  loadDxfUnderlaysEntry,
  saveDxfUnderlaysEntry,
  __resetDxfUnderlaysDbForTests,
} from './drawing2DSlice.dxfPersistence.js';
import type { DxfUnderlayState } from './drawing2DSlice.js';

function sampleEntry(id = 'dxf-1'): DxfUnderlayState {
  return {
    id,
    name: 'plan.dxf',
    underlay: {
      name: 'plan.dxf',
      layers: [],
      bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
      unitScale: 1,
      skipped: {},
      warnings: [],
    },
    visible: true,
    visible3D: true,
    opacity: 1,
    layerVisibility: {},
    placement: { offsetX: 0, offsetY: 0, rotationDeg: 0, scale: 1 },
    georeferenced: false,
  };
}

const DB_NAME = 'ifc-lite-drawing2d-dxf';
const DB_VERSION = 1;

describe('drawing2DSlice.dxfPersistence recovery', () => {
  it('recreates the database when its object store is unexpectedly missing', async () => {
    // Simulate corruption: pre-create the database at the module's own
    // name+version, but with NO object store at all.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        // Intentionally create nothing — the module expects STORE_DXF.
      };
      req.onsuccess = () => { req.result.close(); resolve(); };
      req.onerror = () => reject(req.error);
    });

    const loaded = await loadDxfUnderlaysEntry('any-hash');
    assert.strictEqual(loaded, null, 'a fresh/missing store degrades to null, not a throw');

    // The recreated database must actually be usable afterwards.
    await saveDxfUnderlaysEntry('hash-after-recovery', [sampleEntry()]);
    const after = await loadDxfUnderlaysEntry('hash-after-recovery');
    assert.ok(after);
    assert.strictEqual(after!.dxfUnderlays[0].id, 'dxf-1');
  });
});

describe('drawing2DSlice.dxfPersistence — storage unavailable', () => {
  it('degrades to "nothing restored" (null) rather than throwing when indexedDB is undefined', async () => {
    __resetDxfUnderlaysDbForTests();
    const real = globalThis.indexedDB;
    // @ts-expect-error -- deliberately simulating a context with no IndexedDB
    delete globalThis.indexedDB;
    try {
      const loaded = await loadDxfUnderlaysEntry('irrelevant-hash');
      assert.strictEqual(loaded, null);
      // A save attempt must also degrade silently, not throw.
      await assert.doesNotReject(saveDxfUnderlaysEntry('irrelevant-hash', [sampleEntry()]));
    } finally {
      globalThis.indexedDB = real;
      __resetDxfUnderlaysDbForTests();
    }
  });
});
