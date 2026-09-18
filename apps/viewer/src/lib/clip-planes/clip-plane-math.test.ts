/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIP_PLANE_FACE_OFFSET,
  CLIP_PLANE_MIN_GAP,
  MAX_CLIP_PLANES,
  addClipPlane,
  clipPlaneCenter,
  keptRegionIntersectsBounds,
  moveClipPlane,
  planeFromFace,
  type ClipPlaneState,
} from './clip-plane-math.js';

const bounds = { min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 20, z: 10 } };

/** A plane removing everything above y = `y` (a slab top face). */
const above = (id: string, y: number): ClipPlaneState =>
  ({ id, normal: [0, 1, 0], distance: y, enabled: true, anchor: [0, y, 0] });
/** A plane removing everything below y = `y`. */
const below = (id: string, y: number): ClipPlaneState =>
  ({ id, normal: [0, -1, 0], distance: -y, enabled: true, anchor: [0, y, 0] });

describe('planeFromFace', () => {
  it('removes the side the face normal points into and pushes the plane 1 mm outward', () => {
    const plane = planeFromFace('a', [0, 2, 0], [1, 3, 1])!;
    assert.deepEqual(plane.normal, [0, 1, 0], 'renormalised');
    assert.ok(Math.abs(plane.distance - (3 + CLIP_PLANE_FACE_OFFSET)) < 1e-12);
    assert.deepEqual(plane.anchor, [1, 3, 1]);
  });

  it('refuses a degenerate normal or a non-finite point', () => {
    assert.equal(planeFromFace('a', [0, 0, 0], [0, 0, 0]), null);
    assert.equal(planeFromFace('a', [0, 1, 0], [NaN, 0, 0]), null);
  });
});

describe('addClipPlane', () => {
  it('replaces an existing same-direction plane within 2 degrees, keeping list order', () => {
    const planes = [above('top', 5), below('bottom', 1)];
    const tilted = planeFromFace('top2', [Math.sin(0.01), Math.cos(0.01), 0], [0, 6, 0]);
    const result = addClipPlane(planes, tilted, bounds);
    assert.ok(result.ok);
    assert.equal(result.replacedId, 'top');
    assert.deepEqual(result.planes.map((p) => p.id), ['top2', 'bottom']);
  });

  it('keeps an opposite plane: two faces of one slab make a box wall pair', () => {
    const result = addClipPlane([above('top', 5)], below('bottom', 1), bounds);
    assert.ok(result.ok);
    assert.equal(result.replacedId, null);
    assert.equal(result.planes.length, 2);
  });

  it('keeps a plane that differs by more than the merge angle', () => {
    const result = addClipPlane([above('top', 5)], planeFromFace('wall', [Math.sin(0.1), Math.cos(0.1), 0], [0, 6, 0]), bounds);
    assert.ok(result.ok);
    assert.equal(result.planes.length, 2);
  });

  it('refuses a plane that would cross its opposite partner', () => {
    // kept slab is 1 <= y <= 5; a "remove below 4.995" plane would leave 5 mm.
    const result = addClipPlane([above('top', 5)], below('bottom', 5 - CLIP_PLANE_MIN_GAP / 2), bounds);
    assert.deepEqual(result, { ok: false, reason: 'crossing' });
  });

  it('refuses a plane that empties the model bounds', () => {
    const result = addClipPlane([], above('top', -1), bounds);
    assert.deepEqual(result, { ok: false, reason: 'empty' });
  });

  it('refuses a ninth distinct plane but still replaces a same-direction one', () => {
    const planes: ClipPlaneState[] = [];
    for (let i = 0; i < MAX_CLIP_PLANES; i++) {
      const a = (i / MAX_CLIP_PLANES) * Math.PI;
      planes.push({ id: `p${i}`, normal: [Math.cos(a), 0, Math.sin(a)], distance: 20, enabled: true, anchor: [0, 0, 0] });
    }
    assert.deepEqual(addClipPlane(planes, above('extra', 5), bounds), { ok: false, reason: 'full' });
    const replaced = addClipPlane(planes, { ...planes[3], id: 'again', distance: 15 }, bounds);
    assert.ok(replaced.ok);
    assert.equal(replaced.planes.length, MAX_CLIP_PLANES);
  });
});

describe('moveClipPlane', () => {
  it('clamps a drag so the pair keeps the minimum gap', () => {
    const planes = [above('top', 5), below('bottom', 1)];
    const moved = moveClipPlane(planes, 'top', 0.5, bounds);
    assert.ok(Math.abs(moved[0].distance - (1 + CLIP_PLANE_MIN_GAP)) < 1e-12);
    assert.equal(moved[1], planes[1], 'the partner is untouched');
  });

  it('leaves the list alone when the move would empty the kept region', () => {
    const planes = [above('top', 5)];
    assert.equal(moveClipPlane(planes, 'top', -3, bounds), planes);
  });

  it('moves freely without an opposite partner or bounds', () => {
    const moved = moveClipPlane([above('top', 5)], 'top', 12, null);
    assert.equal(moved[0].distance, 12);
  });
});

describe('keptRegionIntersectsBounds', () => {
  it('ignores disabled planes', () => {
    assert.equal(keptRegionIntersectsBounds([{ ...above('top', -1), enabled: false }], bounds), true);
  });
  it('is true without bounds to check against', () => {
    assert.equal(keptRegionIntersectsBounds([above('top', -1)], null), true);
  });
});

describe('clipPlaneCenter', () => {
  it('projects the anchor onto the live plane along its normal', () => {
    const plane = { ...above('top', 5), anchor: [2, 3, 4] as [number, number, number] };
    assert.deepEqual(clipPlaneCenter(plane), [2, 5, 4]);
  });
});
