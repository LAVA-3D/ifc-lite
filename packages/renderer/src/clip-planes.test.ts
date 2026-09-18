/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tests for the clip-plane uniform packing. `packClipPlanes` is the single
 * source of truth shared by `pipeline.updateUniforms`, the renderer's per-mesh
 * and instanced template loops, the picker, the shadow pass and the point-cloud
 * uniforms, so the lane layout, the zeroed tail and the returned flag bits must
 * stay exactly as the shaders read them (`>> 8u & 0xffu` for the count).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  CLIP_PLANES_ENABLED_BIT,
  CLIP_PLANE_COUNT_SHIFT,
  MAX_CLIP_PLANES,
  clipBoxToPlanes,
  clipPlaneCount,
  packClipPlanes,
  pointClippedByPlanes,
  resolveClipPlanes,
  type ClipPlane,
} from './clip-planes.js';

const box = { min: [-1, -2, -3] as [number, number, number], max: [4, 5, 6] as [number, number, number], enabled: true };

describe('clipBoxToPlanes', () => {
  it('expands an enabled box into six outward planes that keep exactly the inside', () => {
    const planes = clipBoxToPlanes(box);
    assert.strictEqual(planes.length, 6);
    assert.strictEqual(pointClippedByPlanes(planes, 0, 0, 0), false, 'inside kept');
    assert.strictEqual(pointClippedByPlanes(planes, -1.5, 0, 0), true, 'past min.x removed');
    assert.strictEqual(pointClippedByPlanes(planes, 0, 5.5, 0), true, 'past max.y removed');
    assert.strictEqual(pointClippedByPlanes(planes, 4, 5, 6), false, 'the corner itself is on the boundary and kept');
  });

  it('yields nothing for a disabled or absent box', () => {
    assert.deepStrictEqual(clipBoxToPlanes({ ...box, enabled: false }), []);
    assert.deepStrictEqual(clipBoxToPlanes(null), []);
    assert.deepStrictEqual(clipBoxToPlanes(undefined), []);
  });
});

describe('resolveClipPlanes', () => {
  it('renormalises non-unit normals so the plane equation is unchanged', () => {
    const [plane] = resolveClipPlanes([{ normal: [0, 2, 0], distance: 4 }]);
    assert.deepStrictEqual([...plane.normal], [0, 1, 0]);
    assert.strictEqual(plane.distance, 2);
  });

  it('drops degenerate and non-finite planes rather than emitting NaN lanes', () => {
    const planes = resolveClipPlanes([
      { normal: [0, 0, 0], distance: 1 },
      { normal: [Infinity, 0, 0], distance: 1 },
      { normal: [1, 0, 0], distance: NaN },
      { normal: [1, 0, 0], distance: 1 },
    ]);
    assert.strictEqual(planes.length, 1);
  });

  it('appends the expanded box after the explicit planes and caps at the capacity', () => {
    const explicit: ClipPlane[] = [{ normal: [0, 1, 0], distance: 1 }, { normal: [0, -1, 0], distance: 1 }, { normal: [1, 0, 0], distance: 1 }];
    const planes = resolveClipPlanes(explicit, box);
    assert.strictEqual(planes.length, MAX_CLIP_PLANES, '3 explicit + 6 box = 9 → capped at 8');
    assert.deepStrictEqual([...planes[0].normal], [0, 1, 0]);
    assert.deepStrictEqual([...planes[3].normal], [-1, 0, 0], 'first box plane follows the explicit ones');
  });

  it('returns an empty list when nothing clips', () => {
    assert.deepStrictEqual(resolveClipPlanes(undefined, undefined), []);
    assert.deepStrictEqual(resolveClipPlanes([], { ...box, enabled: false }), []);
  });
});

describe('packClipPlanes', () => {
  it('writes normal.xyz + distance per lane and returns the enable bit plus count', () => {
    const out = new Float32Array(84);
    const bits = packClipPlanes([{ normal: [0, 1, 0], distance: 2.5 }, { normal: [-1, 0, 0], distance: 3 }], out, 48);
    assert.strictEqual(bits & CLIP_PLANES_ENABLED_BIT, CLIP_PLANES_ENABLED_BIT);
    assert.strictEqual(clipPlaneCount(bits), 2);
    assert.strictEqual(bits, CLIP_PLANES_ENABLED_BIT | (2 << CLIP_PLANE_COUNT_SHIFT));
    assert.deepStrictEqual([...out.slice(48, 52)], [0, 1, 0, 2.5]);
    assert.deepStrictEqual([...out.slice(52, 56)], [-1, 0, 0, 3]);
  });

  it('zeroes every unused lane so stale planes from a previous draw cannot clip', () => {
    const out = new Float32Array(84).fill(7);
    packClipPlanes([{ normal: [0, 1, 0], distance: 1 }], out, 48);
    for (let i = 52; i < 80; i++) assert.strictEqual(out[i], 0, `lane ${i}`);
    // lanes outside the region stay untouched
    assert.strictEqual(out[47], 7);
    assert.strictEqual(out[80], 7);
  });

  it('returns 0 and zeroes the region for an empty, null or undefined list', () => {
    for (const planes of [[], null, undefined]) {
      const out = new Float32Array(84).fill(7);
      assert.strictEqual(packClipPlanes(planes, out, 48), 0);
      for (let i = 48; i < 80; i++) assert.strictEqual(out[i], 0, `lane ${i}`);
    }
  });

  it('ignores planes beyond the capacity', () => {
    const out = new Float32Array(84);
    const nine = Array.from({ length: 9 }, (_, i) => ({ normal: [1, 0, 0] as const, distance: i }));
    const bits = packClipPlanes(nine, out, 48);
    assert.strictEqual(clipPlaneCount(bits), MAX_CLIP_PLANES);
  });
});
