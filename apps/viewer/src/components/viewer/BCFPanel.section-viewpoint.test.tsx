/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Regression for #4802: a reviewed 2D section can be attached directly to a
 * BCF topic. The test mounts the real drawing canvas and BCF panel together,
 * paints an annotation, clicks the user-facing action, and observes the topic.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import type { Renderer } from '@ifc-lite/renderer';
import { createBCFProject, createBCFTopic } from '@ifc-lite/bcf';
import { GraphicOverrideEngine, type Drawing2D } from '@ifc-lite/drawing-2d';
import { render, cleanup } from '@/test/render.js';
import { useViewerStore } from '@/store/index.js';
import { clearGlobalRefs, setGlobalRendererRef } from '@/hooks/useBCF.js';
import { Drawing2DCanvas } from './Drawing2DCanvas.js';
import { BCFPanel } from './BCFPanel.js';

installLayout();

const DRAWING: Drawing2D = {
  config: {
    plane: { axis: 'y', position: 4, flipped: false },
    projectionDepth: 10,
    includeHiddenLines: false,
    creaseAngle: 30,
    scale: 100,
  },
  lines: [],
  cutPolygons: [],
  projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
  stats: {
    cutLineCount: 0,
    projectionLineCount: 0,
    hiddenLineCount: 0,
    silhouetteLineCount: 0,
    polygonCount: 0,
    totalTriangles: 0,
    processingTimeMs: 0,
  },
};

const renderer = {
  getCamera: () => ({
    getPosition: () => ({ x: 10, y: 5, z: 20 }),
    getTarget: () => ({ x: 1, y: 2, z: 3 }),
    getUp: () => ({ x: 0, y: 1, z: 0 }),
    getFOV: () => Math.PI / 4,
    getAspect: () => 16 / 9,
  }),
} as unknown as Renderer;

let topicGuid = '';
let paintedText: string[] = [];

beforeEach(() => {
  paintedText = [];
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'measureText') return (text: string) => ({ width: text.length * 7 });
      if (property === 'fillText') return (text: string) => { paintedText.push(text); };
      if (property === 'canvas') return { width: 1280, height: 800 };
      return () => undefined;
    },
    set() { return true; },
  }) as unknown as CanvasRenderingContext2D;
  mock.method(HTMLCanvasElement.prototype, 'getContext', (kind: string) => kind === '2d' ? context : null);
  mock.method(HTMLCanvasElement.prototype, 'toDataURL', () =>
    `data:image/png;base64,${Buffer.from(paintedText.join('|')).toString('base64')}`);

  const project = createBCFProject({ name: 'Section review' });
  const topic = createBCFTopic({ title: 'Reviewed section', author: 'reviewer@example.invalid' });
  topicGuid = topic.guid;
  project.topics.set(topic.guid, topic);
  useViewerStore.setState({
    bcfProject: project,
    activeTopicId: topic.guid,
    models: new Map(),
    hiddenEntities: new Set(),
    isolatedEntities: null,
    selectedEntityId: null,
    selectedEntityIds: new Set(),
    drawing2D: DRAWING,
    drawing2DStatus: 'ready',
    drawing2DPanelVisible: true,
  });
  setGlobalRendererRef({ current: renderer });
});

afterEach(() => {
  cleanup();
  clearGlobalRefs();
  mock.restoreAll();
});

test('Capture 2D attaches the painted annotated section to the active BCF topic (#4802)', async () => {
  const ui = render(
    <>
      <Drawing2DCanvas
        drawing={DRAWING}
        transform={{ x: 100, y: 100, scale: 10 }}
        showHiddenLines={false}
        overrideEngine={new GraphicOverrideEngine()}
        overridesEnabled={false}
        entityColorMap={new Map()}
        useIfcMaterials={false}
        sectionAxis="down"
        textAnnotations={[{
          id: 'review-note',
          position: { x: 2, y: 3 },
          text: 'Check fire rating',
          fontSize: 14,
          color: '#000000',
          backgroundColor: '#ffffff',
          borderColor: '#ff0000',
        }]}
      />
      <BCFPanel onClose={() => {}} />
    </>,
  );

  const capture = ui.querySelector<HTMLButtonElement>('[aria-label="Capture current 2D section as viewpoint"]');
  assert.ok(capture, 'the active topic exposes the dedicated 2D capture action');
  assert.equal(capture.disabled, false, 'a visible generated section is capturable');
  await act(async () => {
    capture.click();
    await Promise.resolve();
  });

  const topic = useViewerStore.getState().bcfProject?.topics.get(topicGuid);
  assert.equal(topic?.viewpoints.length, 1);
  const viewpoint = topic?.viewpoints[0];
  assert.ok(viewpoint?.perspectiveCamera, 'the existing BCF camera semantics are preserved');
  assert.ok(viewpoint.snapshot, 'the viewpoint carries an image');
  const imagePayload = Buffer.from(viewpoint.snapshot.split(',')[1] ?? '', 'base64').toString();
  assert.match(imagePayload, /Check fire rating/, 'the captured canvas includes the reviewed annotation');
});
