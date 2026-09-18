/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ClipPlaneState } from './clip-plane-math.js';
import { CLIP_PLANE_OUTLINE_MARGIN, clipPlaneOutline } from './clip-plane-outline.js';

const bounds = { min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 20, z: 10 } };

const plane = (
  id: string,
  normal: [number, number, number],
  distance: number,
  anchor: [number, number, number] = [7, 3, -8],
): ClipPlaneState => ({ id, normal, distance, enabled: true, anchor });

function extent(poly: readonly (readonly number[])[], axis: number): [number, number] {
  return [Math.min(...poly.map((p) => p[axis])), Math.max(...poly.map((p) => p[axis]))];
}

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const nearExtent = (poly: readonly (readonly number[])[], axis: number, lo: number, hi: number) => {
  const [a, b] = extent(poly, axis);
  near(a, lo);
  near(b, hi);
};

describe('clipPlaneOutline', () => {
  it('a lone plane draws the model silhouette on the plane plus the margin, centred on the bounds', () => {
    const top = plane('top', [0, 1, 0], 12);
    const { polygon, center } = clipPlaneOutline(top, [top], bounds);
    assert.equal(polygon.length, 4);
    for (const p of polygon) near(p[1], 12);
    nearExtent(polygon, 0, -10 - CLIP_PLANE_OUTLINE_MARGIN, 10 + CLIP_PLANE_OUTLINE_MARGIN);
    nearExtent(polygon, 2, -10 - CLIP_PLANE_OUTLINE_MARGIN, 10 + CLIP_PLANE_OUTLINE_MARGIN);
    // Centred on the model, not on the anchor point (7, 3, -8).
    near(center[0], 0);
    near(center[1], 12);
    near(center[2], 0);
  });

  it('a box of planes trims each face to the box, overshooting neighbours by the margin', () => {
    const planes = [
      plane('top', [0, 1, 0], 6), plane('bottom', [0, -1, 0], -2),
      plane('east', [1, 0, 0], 3), plane('west', [-1, 0, 0], 1),
      plane('north', [0, 0, 1], 4), plane('south', [0, 0, -1], 2),
    ];
    const top = clipPlaneOutline(planes[0], planes, bounds, 1);
    nearExtent(top.polygon, 0, -2, 4); // box x in [-1, 3], plus 1 m each side
    nearExtent(top.polygon, 2, -3, 5); // box z in [-2, 4], plus 1 m each side
    near(top.center[0], 1);
    near(top.center[2], 1);
    const east = clipPlaneOutline(planes[2], planes, bounds, 1);
    nearExtent(east.polygon, 1, 1, 7); // box y in [2, 6]
    nearExtent(east.polygon, 2, -3, 5);
  });

  it('never grows past the padded model bounds even when the box is bigger than the model', () => {
    const planes = [plane('top', [0, 1, 0], 6), plane('east', [1, 0, 0], 50)];
    const top = clipPlaneOutline(planes[0], planes, bounds, 1);
    nearExtent(top.polygon, 0, -11, 11);
  });

  it('an oblique plane is clipped to the bounds and stays planar', () => {
    const n: [number, number, number] = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const diag = plane('diag', n, 0);
    const { polygon } = clipPlaneOutline(diag, [diag], bounds, 0);
    assert.ok(polygon.length >= 4);
    for (const p of polygon) {
      near(p[0] * n[0] + p[2] * n[2], 0);
      assert.ok(p[0] >= -10 - 1e-9 && p[0] <= 10 + 1e-9);
      assert.ok(p[1] >= -1e-9 && p[1] <= 20 + 1e-9);
    }
  });

  it('ignores disabled planes and the plane itself', () => {
    const top = plane('top', [0, 1, 0], 6);
    const off = { ...plane('east', [1, 0, 0], 3), enabled: false };
    const { polygon } = clipPlaneOutline(top, [top, off], bounds, 1);
    nearExtent(polygon, 0, -11, 11);
  });

  it('a plane dragged past the padded bounds keeps a full square so it can still be grabbed', () => {
    const far = plane('top', [0, 1, 0], 40);
    const { polygon, center } = clipPlaneOutline(far, [far], bounds, 1);
    assert.equal(polygon.length, 4);
    near(center[1], 40);
    const [lo, hi] = extent(polygon, 0);
    assert.ok(hi - lo > 20);
  });

  it('without bounds falls back to a square of the given half size around the origin foot', () => {
    const top = plane('top', [0, 1, 0], 3);
    const { polygon, center } = clipPlaneOutline(top, [top], null, 1, 5);
    nearExtent(polygon, 0, -5, 5);
    assert.deepEqual(center, [0, 3, 0]);
  });
});
