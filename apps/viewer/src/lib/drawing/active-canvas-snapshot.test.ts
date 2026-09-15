/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { hasActiveDrawingCanvas, markActiveDrawingCanvasRendered, registerActiveDrawingCanvas } from './active-canvas-snapshot.js';

function drawing(position: number): Drawing2D {
  return {
    config: { plane: { axis: 'y', position, flipped: false }, projectionDepth: 1,
      includeHiddenLines: false, creaseAngle: 30, scale: 100 },
    lines: [], cutPolygons: [], projectionPolygons: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
    stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0,
      silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
  };
}

test('a stale canvas cleanup cannot release the newer capture lease (#4802)', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 10; canvas.height = 10;
  const first = drawing(1), releaseFirst = registerActiveDrawingCanvas(canvas, first);
  markActiveDrawingCanvasRendered(canvas, first, true);
  const second = drawing(2), releaseSecond = registerActiveDrawingCanvas(canvas, second);
  markActiveDrawingCanvasRendered(canvas, second, true);

  releaseFirst();
  assert.equal(hasActiveDrawingCanvas(), true, 'the old registration cannot clear the replacement');
  releaseSecond();
  assert.equal(hasActiveDrawingCanvas(), false, 'the active cleanup releases canvas and drawing references');
});
