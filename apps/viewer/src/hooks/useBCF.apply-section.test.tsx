/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Applying a BCF viewpoint shows exactly its clipping (#4910).
 *
 * A viewpoint's `<ClippingPlanes>` become the viewer's clipping planes, taken
 * exactly and never routed into the Section tool
 * (docs/architecture/clipping-planes.md); the Section tool's own cut is
 * cleared so the view matches the topic. A viewpoint without planes clears
 * both: the on-screen cut and the one remembered for the next Section-tool
 * open.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Renderer } from '@ifc-lite/renderer';
import type { GeometryResult } from '@ifc-lite/geometry';
import type { BCFViewpoint } from '@ifc-lite/bcf';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store/types';
import { activeSectionPlane } from '@/store/section-active';
import { fixtureModel, fixtureModels } from '@/test/store-fixture.js';
import { useBCF } from './useBCF.js';

const BOUNDS = { min: { x: -10, y: 0, z: -8 }, max: { x: 10, y: 12, z: 8 } };

const renderer = {
  getCamera: () => ({
    getPosition: () => ({ x: 30, y: 20, z: 25 }),
    getTarget: () => ({ x: 1, y: 2, z: 3 }),
    getUp: () => ({ x: 0, y: 1, z: 0 }),
    getFOV: () => Math.PI / 4,
    getAspect: () => 16 / 9,
    getDistance: () => 10,
    setPosition: () => {},
    setTarget: () => {},
  }),
} as unknown as Renderer;

function model(): FederatedModel {
  const geometryResult: GeometryResult = {
    meshes: [],
    totalVertices: 0,
    totalTriangles: 0,
    coordinateInfo: {
      originShift: { x: 0, y: 0, z: 0 },
      originalBounds: BOUNDS,
      shiftedBounds: BOUNDS,
      hasLargeCoordinates: false,
    },
  };
  return { ...fixtureModel('m'), loadedAt: 1, geometryResult } as FederatedModel;
}

let api: ReturnType<typeof useBCF> | null = null;
let root: Root | null = null;

function Probe(): null {
  api = useBCF({ rendererRef: { current: renderer } });
  return null;
}

const s = () => useViewerStore.getState();

beforeEach(async () => {
  useViewerStore.setState({
    ...fixtureModels(model()),
    geometryResult: null,
    ifcDataStore: null,
    isolatedEntities: null,
    hiddenEntities: new Set(),
    selectedEntityId: null,
    selectedEntityIds: new Set(),
    activeTool: 'select',
  });
  s().setSectionPlaneEnabled(false);
  useViewerStore.setState({ sectionPlane: { ...s().sectionPlane, custom: undefined, flipped: false } });
  const container = globalThis.document.createElement('div');
  globalThis.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<Probe />));
  assert.ok(api, 'the probe must be mounted');
});

afterEach(async () => {
  const current = root;
  root = null;
  api = null;
  if (current) await act(async () => current.unmount());
});

async function capture(): Promise<BCFViewpoint> {
  let viewpoint: BCFViewpoint | null = null;
  await act(async () => {
    viewpoint = await api!.createViewpointFromState({ includeSnapshot: false });
  });
  assert.ok(viewpoint, 'a viewpoint must be produced');
  return viewpoint;
}

async function cutInSectionTool(axis: 'down' | 'front' | 'side', position: number): Promise<void> {
  await act(async () => {
    s().setActiveTool('section');
    s().setSectionPlaneAxis(axis);
    s().setSectionPlanePosition(position);
  });
}

describe('useBCF applyViewpoint — section cut (#4910)', () => {
  it('a viewpoint with clipping planes shows its cut, round-tripping a captured one', async () => {
    await cutInSectionTool('front', 30);
    const viewpoint = await capture();
    assert.equal(viewpoint.clippingPlanes?.length, 1, 'the visible cut is captured');

    // The user moves on: another tool, another cut remembered.
    await cutInSectionTool('side', 80);
    await act(async () => s().setActiveTool('select'));
    assert.equal(activeSectionPlane(s()), null);

    await act(async () => api!.applyViewpoint(viewpoint, false));
    // The cut comes back as an exact clipping plane, not as a Section-tool cut:
    // 'front' at 30% of z in [-8, 8] is the plane z = -3.2 removing +z.
    assert.equal(activeSectionPlane(s()), null, 'the Section tool is not opened for a viewpoint');
    assert.equal(s().activeTool, 'select');
    const planes = s().clipPlanes;
    assert.equal(planes.length, 1, 'BUG: the viewpoint cut was stored but is not on screen');
    assert.ok(Math.abs(planes[0].normal[2] + 1) < 1e-9 && Math.abs(planes[0].normal[0]) < 1e-9 && Math.abs(planes[0].normal[1]) < 1e-9,
      `removes the +z half, got ${planes[0].normal.join(',')}`);
    assert.ok(Math.abs(planes[0].distance - 3.2) < 1e-6, `plane at z = -3.2, got distance ${planes[0].distance}`);

    const again = await capture();
    assert.equal(again.clippingPlanes?.length, 1, 'capturing the applied view keeps its cut');
    assert.ok(Math.abs(again.clippingPlanes![0].location.y - 3.2) < 1e-6, 'and writes the same plane (BCF y = -viewer z)');
  });

  it('a viewpoint with several planes keeps all of them; one without clears the list', async () => {
    const boxed: BCFViewpoint = {
      guid: '66666666-6666-4666-8666-666666666666',
      clippingPlanes: [
        { location: { x: 0, y: 0, z: 9 }, direction: { x: 0, y: 0, z: 1 } },   // remove above z(BCF)=9 → viewer y > 9
        { location: { x: 0, y: 0, z: 2 }, direction: { x: 0, y: 0, z: -1 } },  // remove below viewer y = 2
        { location: { x: 5, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },   // remove x > 5
      ],
    };
    await act(async () => api!.applyViewpoint(boxed, false));
    assert.equal(s().clipPlanes.length, 3, 'every plane is applied, in file order');
    assert.deepEqual(s().clipPlanes.map((p) => p.normal.map((v) => Math.round(v) || 0)), [[0, 1, 0], [0, -1, 0], [1, 0, 0]]);

    await act(async () => api!.applyViewpoint({ guid: '77777777-7777-4777-8777-777777777777' }, false));
    assert.equal(s().clipPlanes.length, 0, 'a viewpoint without planes clears the list');
  });

  it('a viewpoint without clipping planes clears an on-screen cut', async () => {
    await cutInSectionTool('down', 40);
    const uncut: BCFViewpoint = { guid: '44444444-4444-4444-8444-444444444444' };
    await act(async () => api!.applyViewpoint(uncut, false));
    assert.equal(activeSectionPlane(s()), null, 'BUG: the topic has no cut but the view keeps one');
    assert.equal((await capture()).clippingPlanes, undefined, 'and exporting it again adds none');
  });

  it('a viewpoint without clipping planes also drops the cut remembered for the next Section-tool open', async () => {
    // A face-picked cut: SectionPanel re-arms pick mode on open, so only the
    // remembered plane could bring it back.
    await act(async () => {
      s().setActiveTool('section');
      s().setSectionPlaneFromFace([0, 1, 0], [0, 4, 0]);
    });
    await act(async () => s().setActiveTool('select'));
    await act(async () => api!.applyViewpoint({ guid: '55555555-5555-4555-8555-555555555555' }, false));
    await act(async () => s().setActiveTool('section'));
    assert.equal(s().sectionPlane.enabled, false, 'the cleared cut must not come back');
  });
});
