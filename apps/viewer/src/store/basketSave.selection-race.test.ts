/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { RefObject } from 'react';
import type { Renderer } from '@ifc-lite/renderer';
import { setGlobalRendererRef } from '@/hooks/useBCF.js';
import { useViewerStore } from './index.js';
import { saveBasketViewWithThumbnailFromStore } from './basketSave.js';

let releaseGpu: () => void;

beforeEach(() => {
  const gate = new Promise<void>((resolve) => { releaseGpu = resolve; });
  const renderer = {
    getGPUDevice: () => ({ queue: { onSubmittedWorkDone: () => gate } }),
  } as unknown as Renderer;
  setGlobalRendererRef({ current: renderer } as RefObject<Renderer | null>);
  const canvas = document.createElement('canvas');
  canvas.dataset.viewport = 'main';
  canvas.toDataURL = () => 'data:image/png;base64,AA==';
  document.body.appendChild(canvas);
  useViewerStore.setState({
    selectedEntityId: 44,
    selectedEntityIds: new Set([44, 45]),
    selectedEntity: { modelId: 'm1', expressId: 44 },
    selectedEntitiesSet: new Set(['m1:44', 'm1:45']),
    selectedEntities: [{ modelId: 'm1', expressId: 44 }, { modelId: 'm1', expressId: 45 }],
    selectedModelId: null,
    selectionRevision: 4,
    chartSlice: new Set([44, 45]),
    chartSelectionRevision: 4,
  });
});

afterEach(() => {
  document.querySelectorAll('canvas[data-viewport="main"]').forEach((canvas) => canvas.remove());
  setGlobalRendererRef({ current: null });
  releaseGpu();
});

describe('basket thumbnail selection provenance (#4832)', () => {
  it('does not restore a stale snapshot over a selection made during capture', async () => {
    const saving = saveBasketViewWithThumbnailFromStore();
    await Promise.resolve();
    assert.equal(useViewerStore.getState().selectedEntityIds.size, 0, 'capture clears the outline');

    useViewerStore.getState().setSelectedEntityIds([99]);
    useViewerStore.getState().setSelectedEntityId(99);
    releaseGpu();
    await saving;

    assert.deepEqual([...useViewerStore.getState().selectedEntityIds], [99]);
    assert.equal(useViewerStore.getState().selectedEntityId, 99);
  });

  it('restores chart producer provenance when no newer selection intervenes', async () => {
    const saving = saveBasketViewWithThumbnailFromStore();
    releaseGpu();
    await saving;

    const state = useViewerStore.getState();
    assert.deepEqual([...state.selectedEntityIds], [44, 45]);
    assert.equal(state.chartSelectionRevision, state.selectionRevision);
  });
});
