/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { useViewerStore } from '@/store';
import { fixtureModel } from '@/test/store-fixture';
import { createDefaultSheet } from '@/store/slices/sheetSlice';
import { loadSheet, loadSheetTemplates, saveSheet } from '@/store/slices/sheetSlice.persistence';
import { createSheetPersistence } from './sheetPersistence';

let bridge: ReturnType<typeof createSheetPersistence> | undefined;
beforeEach(() => {
  useViewerStore.setState({ activeModelId: null, models: new Map(), activeSheet: null, savedSheetTemplates: [], sheetEnabled: false });
  localStorage.clear();
});
afterEach(() => { bridge?.dispose(); bridge = undefined; });

function model(id: string) {
  return { ...fixtureModel(id), sourceFile: new File([`ISO-10303-21;${id}`], `${id}.ifc`) };
}

describe('sheet persistence lifecycle (#4836)', () => {
  it('restores after a fresh bridge and reload, while templates remain global and deletes survive reload', () => {
    const a = model('reload-a');
    useViewerStore.setState({ models: new Map([[a.id, a]]), activeModelId: a.id });
    bridge = createSheetPersistence();
    bridge.settleHash(a.id, 'content-a', a.sourceFile);
    useViewerStore.getState().createSheet({ paperId: 'A1_LANDSCAPE' });
    useViewerStore.getState().updateTitleBlockField('project-name', 'Saved project');
    useViewerStore.getState().saveAsTemplate('Reusable drawing');
    const expected = useViewerStore.getState().activeSheet;
    const templates = useViewerStore.getState().savedSheetTemplates;
    assert.deepEqual(loadSheet('content-a'), expected);
    bridge.dispose();
    useViewerStore.setState({ activeSheet: null, savedSheetTemplates: [], sheetEnabled: false });
    bridge = createSheetPersistence();
    bridge.settleHash(a.id, 'content-a', a.sourceFile);
    assert.deepEqual(useViewerStore.getState().activeSheet, expected);
    assert.deepEqual(useViewerStore.getState().savedSheetTemplates, templates);
    useViewerStore.getState().clearSheet();
    assert.equal(loadSheet('content-a'), null);
    assert.deepEqual(loadSheetTemplates(), templates);
    useViewerStore.getState().deleteTemplate(templates[0].id);
    assert.deepEqual(loadSheetTemplates(), []);
  });

  it('switches A → B → A synchronously without persisting another model’s sheet or a transition clear', () => {
    const a = model('switch-a');
    const b = model('switch-b');
    const sheetA = { ...createDefaultSheet(), name: 'A' };
    const sheetB = { ...createDefaultSheet(), name: 'B' };
    saveSheet('hash-a', sheetA); saveSheet('hash-b', sheetB);
    useViewerStore.setState({ models: new Map([[a.id, a], [b.id, b]]), activeModelId: a.id });
    bridge = createSheetPersistence();
    bridge.settleHash(a.id, 'hash-a', a.sourceFile);
    useViewerStore.getState().setActiveModel(b.id);
    assert.equal(useViewerStore.getState().activeSheet, null);
    assert.deepEqual(loadSheet('hash-b'), sheetB);
    bridge.settleHash(b.id, 'hash-b', b.sourceFile);
    assert.deepEqual(useViewerStore.getState().activeSheet, sheetB);
    useViewerStore.getState().setActiveModel(a.id);
    assert.deepEqual(useViewerStore.getState().activeSheet, sheetA);
    assert.deepEqual(loadSheet('hash-a'), sheetA);
    useViewerStore.getState().resetViewerState();
    assert.equal(useViewerStore.getState().activeSheet, null);
    assert.deepEqual(loadSheet('hash-a'), sheetA);
  });

  it('preserves edits made before hashing, and ignores stale results after a switch or source replacement', () => {
    const a = model('pending-a');
    const b = model('pending-b');
    saveSheet('hash-a', { ...createDefaultSheet(), name: 'Old saved A' });
    useViewerStore.setState({ models: new Map([[a.id, a], [b.id, b]]), activeModelId: a.id });
    bridge = createSheetPersistence();
    useViewerStore.getState().createSheet();
    useViewerStore.getState().updateSheet({ name: 'New A edit' });
    useViewerStore.getState().setActiveModel(b.id);
    bridge.settleHash(a.id, 'hash-a', a.sourceFile);
    assert.equal(useViewerStore.getState().activeSheet, null);
    assert.equal(loadSheet('hash-a')?.name, 'New A edit');
    useViewerStore.getState().createSheet();
    useViewerStore.getState().clearSheet();
    saveSheet('hash-b', createDefaultSheet());
    bridge.settleHash(b.id, 'hash-b', b.sourceFile);
    assert.equal(loadSheet('hash-b'), null, 'explicit clear before the hash settles wins over disk');
    const replacement = { ...b, sourceFile: new File(['different bytes'], 'new.ifc') };
    useViewerStore.setState({ models: new Map([[a.id, a], [b.id, replacement]]) });
    bridge.settleHash(b.id, 'old-source', b.sourceFile);
    assert.equal(useViewerStore.getState().activeSheet, null);
    useViewerStore.getState().createSheet();
    assert.equal(loadSheet('old-source'), null);
  });

  it('forgets closed model sessions and reloads their latest saved setup on reopening', () => {
    const a = model('closed-a');
    useViewerStore.setState({ models: new Map([[a.id, a]]), activeModelId: a.id });
    bridge = createSheetPersistence();
    bridge.settleHash(a.id, 'closed-hash', a.sourceFile);
    useViewerStore.getState().createSheet();
    useViewerStore.setState({ models: new Map(), activeModelId: null });
    const newer = { ...createDefaultSheet(), name: 'Updated in another tab' };
    saveSheet('closed-hash', newer);
    useViewerStore.setState({ models: new Map([[a.id, a]]), activeModelId: a.id });
    bridge.settleHash(a.id, 'closed-hash', a.sourceFile);
    assert.deepEqual(useViewerStore.getState().activeSheet, newer);
    assert.deepEqual(loadSheet('closed-hash'), newer);
  });
});
