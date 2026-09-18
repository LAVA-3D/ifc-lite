/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tests for the picker uniform packing. The layout + flag bits MUST match the
 * WGSL `Uniforms` struct in `picker.ts` and the main render's section/clip
 * discards, otherwise clipped geometry stays pickable (or the wrong geometry
 * gets clipped). clipFlags is a u32 view aliasing float lanes 20-23.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { packPickUniforms, PICK_CLIP_PLANES_LANE } from './pick-uniforms.js';
import { CLIP_PLANE_COUNT_SHIFT, clipBoxToPlanes } from './clip-planes.js';
import type { PickClipState } from './types.js';

function fresh(): { out: Float32Array; flags: Uint32Array } {
  const out = new Float32Array(56);
  const flags = new Uint32Array(out.buffer, 80, 4); // byte 80 = float lane 20
  return { out, flags };
}

const VP = Float32Array.from({ length: 16 }, (_, i) => i + 1);

describe('packPickUniforms', () => {
  it('copies viewProj into lanes 0-15', () => {
    const { out, flags } = fresh();
    packPickUniforms(VP, null, out, flags);
    assert.deepStrictEqual([...out.slice(0, 16)], [...VP]);
  });

  it('no clip: section + plane lanes zeroed and all flag bits clear', () => {
    const { out, flags } = fresh();
    out.fill(9, 16);
    packPickUniforms(VP, null, out, flags);
    assert.strictEqual(flags[0], 0);
    assert.deepStrictEqual([...out.slice(16, 20)], [0, 0, 0, 0]);
    assert.deepStrictEqual([...out.slice(24, 56)], new Array(32).fill(0));
  });

  it('section plane: writes normal+distance at 16-19 and sets bit 0', () => {
    const { out, flags } = fresh();
    const clip: PickClipState = {
      sectionPlane: { normal: [0, 1, 0], distance: 2.5, flipped: false },
    };
    packPickUniforms(VP, clip, out, flags);
    assert.deepStrictEqual([...out.slice(16, 20)], [0, 1, 0, 2.5]);
    assert.strictEqual(flags[0] & 1, 1, 'sectionEnabled');
    assert.strictEqual(flags[0] & 2, 0, 'not flipped');
    assert.strictEqual(flags[0] & 4, 0, 'no clip planes');
  });

  it('flipped section sets bit 1 as well', () => {
    const { out, flags } = fresh();
    packPickUniforms(VP, { sectionPlane: { normal: [1, 0, 0], distance: -3, flipped: true } }, out, flags);
    assert.strictEqual(flags[0] & 1, 1);
    assert.strictEqual(flags[0] & 2, 2);
  });

  it('clip planes: writes each plane from lane 24 and packs the count', () => {
    const { out, flags } = fresh();
    const planes = clipBoxToPlanes({ min: [-1, -2, -3], max: [4, 5, 6], enabled: true });
    packPickUniforms(VP, { clipPlanes: planes }, out, flags);
    assert.strictEqual(flags[0] & 4, 4, 'clip planes bit');
    assert.strictEqual(flags[0] >>> CLIP_PLANE_COUNT_SHIFT, 6, 'six box planes');
    assert.strictEqual(flags[0] & 1, 0, 'no section');
    // first plane: -x face of the box → normal (-1,0,0), distance -min.x = 1
    assert.deepStrictEqual([...out.slice(PICK_CLIP_PLANES_LANE, PICK_CLIP_PLANES_LANE + 4)], [-1, 0, 0, 1]);
    // fourth plane: +x face → normal (1,0,0), distance max.x = 4
    assert.deepStrictEqual([...out.slice(PICK_CLIP_PLANES_LANE + 12, PICK_CLIP_PLANES_LANE + 16)], [1, 0, 0, 4]);
    // lanes 7 and 8 unused → zero
    assert.deepStrictEqual([...out.slice(PICK_CLIP_PLANES_LANE + 24, 56)], new Array(8).fill(0));
  });

  it('an empty plane list does not set bit 2', () => {
    const { out, flags } = fresh();
    packPickUniforms(VP, { clipPlanes: [] }, out, flags);
    assert.strictEqual(flags[0] & 4, 0);
    assert.strictEqual(flags[0] >>> CLIP_PLANE_COUNT_SHIFT, 0);
  });

  it('section + clip planes together: bits 0, 1, 2 and the count all set', () => {
    const { out, flags } = fresh();
    const clip: PickClipState = {
      sectionPlane: { normal: [0, 0, 1], distance: 1, flipped: true },
      clipPlanes: [{ normal: [0, 1, 0], distance: 3 }],
    };
    packPickUniforms(VP, clip, out, flags);
    assert.strictEqual(flags[0] & 7, 7);
    assert.strictEqual(flags[0] >>> CLIP_PLANE_COUNT_SHIFT, 1);
    assert.deepStrictEqual([...out.slice(24, 28)], [0, 1, 0, 3]);
  });

  it('a second pack with no clip clears the lanes and flags of the first', () => {
    const { out, flags } = fresh();
    packPickUniforms(VP, { sectionPlane: { normal: [0, 0, 1], distance: 1, flipped: false }, clipPlanes: [{ normal: [1, 0, 0], distance: 2 }] }, out, flags);
    packPickUniforms(VP, null, out, flags);
    assert.strictEqual(flags[0], 0);
    assert.deepStrictEqual([...out.slice(16, 56)], new Array(40).fill(0));
  });
});
