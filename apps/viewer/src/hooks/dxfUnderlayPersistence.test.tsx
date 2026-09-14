/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Integration coverage for `dxfUnderlaySave.ts`'s wiring into
 * `useDrawing2DPersistence.ts` (issue #4153, reopened): proves restore-on
 * -model-activate actually populates `dxfUnderlays`, and that a fast model
 * switch does not let a stale async IndexedDB lookup for the model just
 * switched AWAY FROM land on the newly active model's state. Mirrors
 * `useDrawing2DPersistence.test.tsx`'s harness (a `Probe` component + a real
 * React tree via `@/test/setup-dom.js`).
 */

import 'fake-indexeddb/auto';
import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store';
import type { DxfUnderlayState } from '@/store/slices/drawing2DSlice.js';
import { useDrawing2DPersistence } from './useDrawing2DPersistence.js';
import { restoreDxfUnderlaysFor } from './dxfUnderlaySave.js';
import { clearAllDrawing2DEntries } from '@/store/slices/drawing2DSlice.persistence.js';
import {
  loadDxfUnderlaysEntry,
  saveDxfUnderlaysEntry,
  clearAllDxfUnderlaysEntries,
  __resetDxfUnderlaysDbForTests,
} from '@/store/slices/drawing2DSlice.dxfPersistence.js';
import { computeFullSourceHashFromBlob } from '@/utils/sourceContentHash.js';

function stubModel(id: string, sourceFile: File): FederatedModel {
  return {
    id,
    name: `${id}.ifc`,
    ifcDataStore: null,
    geometryResult: null,
    visible: true,
    collapsed: false,
    schemaVersion: 'IFC4',
    loadedAt: 0,
    fileSize: sourceFile.size,
    sourceFile,
    idOffset: 0,
    maxExpressId: 0,
  } as FederatedModel;
}

function fileWithBytes(seed: number, name: string): File {
  const bytes = new Uint8Array(256).map((_, i) => (i + seed) % 256);
  return new File([bytes], name, { type: 'application/octet-stream' });
}

function sampleUnderlay(id: string): DxfUnderlayState {
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

function Probe(): null {
  useDrawing2DPersistence();
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Probe />);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function flushDeep(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
  });
}

beforeEach(() => {
  __resetDxfUnderlaysDbForTests();
  clearAllDrawing2DEntries();
  useViewerStore.getState().resetViewerState();
  useViewerStore.getState().clearAllModels();
  useViewerStore.setState({ dxfUnderlays: [] });
});

afterEach(async () => {
  const current = root;
  root = null;
  if (current) await act(async () => current.unmount());
  if (container) { container.remove(); container = null; }
  clearAllDrawing2DEntries();
  await clearAllDxfUnderlaysEntries();
});

describe('dxfUnderlays restore on model activate', () => {
  it('populates dxfUnderlays from IndexedDB once the active model\'s hash resolves', async () => {
    const fileA = fileWithBytes(1, 'a.ifc');
    const hashA = (await computeFullSourceHashFromBlob(fileA))!;
    await saveDxfUnderlaysEntry(hashA, [sampleUnderlay('saved-a')]);

    const modelA = stubModel('populate-model-a', fileA);
    useViewerStore.setState({ models: new Map([['populate-model-a', modelA]]) });
    await mount();

    await act(async () => { useViewerStore.getState().setActiveModel('populate-model-a'); });
    await flushDeep();

    const ids = useViewerStore.getState().dxfUnderlays.map((u) => u.id);
    assert.deepStrictEqual(ids, ['saved-a'], 'the saved underlay for this model\'s hash must be restored into the live store');
  });

  it('leaves dxfUnderlays untouched (not reset to []) when nothing was saved for the hash', async () => {
    const fileA = fileWithBytes(2, 'b.ifc');
    // Distinct model id from every other test in this file: `hashCache`
    // (`drawingMarkupRestorePrecedence.ts`) is module-level and keyed by
    // modelId, not content — reusing an id here would read back an earlier
    // test's cached hash for it instead of this test's own file.
    const modelA = stubModel('untouched-model-a', fileA);
    useViewerStore.setState({ models: new Map([['untouched-model-a', modelA]]), dxfUnderlays: [sampleUnderlay('preexisting')] });
    await mount();

    await act(async () => { useViewerStore.getState().setActiveModel('untouched-model-a'); });
    await flushDeep();

    const ids = useViewerStore.getState().dxfUnderlays.map((u) => u.id);
    assert.deepStrictEqual(ids, ['preexisting'], 'nothing saved for this hash must not clear or replace the live (preserved) dxfUnderlays');
  });

  it('does not add anything until the hash resolves — no premature restore', async () => {
    const fileA = fileWithBytes(3, 'c.ifc');
    const hashA = (await computeFullSourceHashFromBlob(fileA))!;
    await saveDxfUnderlaysEntry(hashA, [sampleUnderlay('saved-c')]);

    const modelA = stubModel('premature-model-a', fileA);
    useViewerStore.setState({ models: new Map([['premature-model-a', modelA]]) });
    await mount();

    // Bare, not wrapped in act/flush: the hash+IDB lookup is async and has
    // not resolved yet at this synchronous point.
    useViewerStore.getState().setActiveModel('premature-model-a');
    assert.deepStrictEqual(useViewerStore.getState().dxfUnderlays, [], 'restore must not happen synchronously before the hash/IDB lookup resolves');

    // flushDeep, not flush: this restore chains a hash computation AND an
    // IndexedDB open+transaction, one more async hop than the localStorage
    // markup path flush()'s two ticks were tuned for.
    await flushDeep();
    assert.deepStrictEqual(useViewerStore.getState().dxfUnderlays.map((u) => u.id), ['saved-c']);
  });
});

// This first describe exercises `useDrawing2DPersistence.ts`'s OUTER
// `stillCurrent()` guard (in `applyHash`, unmodified by this feature): a
// model switch during the HASH computation itself already stops `applyHash`
// from ever calling `restoreDxfUnderlaysFor` for the stale model, so
// `dxfUnderlaySave.ts`'s OWN inner `stillCurrent` check is never reached by
// this scenario. The second describe below targets that inner guard
// directly — see its own comment for why a full-hook race can't reach it
// deterministically.
describe('dxfUnderlays restore — fast model switch during hash resolution (outer guard)', () => {
  it('a slow lookup for the model switched AWAY FROM must not land on the newly active model', async () => {
    const fileA = fileWithBytes(10, 'race-a.ifc');
    const fileB = fileWithBytes(11, 'race-b.ifc');
    const hashA = (await computeFullSourceHashFromBlob(fileA))!;
    await saveDxfUnderlaysEntry(hashA, [sampleUnderlay('saved-a')]);

    const modelA = stubModel('race-model-a', fileA);
    const modelB = stubModel('race-model-b', fileB);
    useViewerStore.setState({ models: new Map([['race-model-a', modelA], ['race-model-b', modelB]]) });
    await mount();

    // Activate A (its IndexedDB lookup starts), then immediately switch to B
    // before A's lookup can resolve — no `flush()` in between.
    useViewerStore.getState().setActiveModel('race-model-a');
    useViewerStore.getState().setActiveModel('race-model-b');

    // Let every pending microtask/timer (including A's now-stale lookup)
    // settle.
    await flushDeep();

    const ids = useViewerStore.getState().dxfUnderlays.map((u) => u.id);
    assert.ok(
      !ids.includes('saved-a'),
      `model A's saved underlay must never be applied once B is active (got: ${JSON.stringify(ids)})`,
    );
  });
});

// MUTATION TARGET: `dxfUnderlaySave.ts`'s OWN `if (!stillCurrent()) return;`
// inside `restoreDxfUnderlaysFor`, called directly here (not through the
// full hook) so the race window is the IndexedDB lookup ITSELF, not the
// hash computation the outer guard above already closes — a full-hook test
// can't force that narrower window deterministically since both steps
// resolve near-instantly against `fake-indexeddb`. Delete the guard and
// this test must fail.
describe('dxfUnderlays restore — stillCurrent guards the IndexedDB lookup itself', () => {
  it('a stillCurrent() that flips false while the load is in flight must prevent the merge', async () => {
    await saveDxfUnderlaysEntry('direct-hash', [sampleUnderlay('direct-saved')]);
    useViewerStore.setState({ dxfUnderlays: [] });

    let current = true;
    await restoreDxfUnderlaysFor('direct-model', 'direct-hash', () => current);
    // Sanity: with the guard passing throughout, the merge does happen.
    assert.deepStrictEqual(useViewerStore.getState().dxfUnderlays.map((u) => u.id), ['direct-saved']);

    useViewerStore.setState({ dxfUnderlays: [] });
    current = false; // simulate "the model changed while this load was in flight"
    await restoreDxfUnderlaysFor('direct-model', 'direct-hash', () => current);
    assert.deepStrictEqual(
      useViewerStore.getState().dxfUnderlays,
      [],
      'a stillCurrent() that has gone false must prevent the merge from ever being applied',
    );
  });
});
