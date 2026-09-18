/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Packing for the GPU picker's per-pass uniform block (56 floats / 224 bytes):
 *
 *   0-15  viewProj     mat4x4<f32>
 *   16-19 sectionPlane vec4<f32>   (xyz normal, w distance)
 *   20-23 clipFlags    vec4<u32>   (x: bit0 sectionEnabled, bit1 flipped,
 *                                   bit2 clipPlanes, bits 8..15 plane count)
 *   24-55 clipPlanes   array<vec4<f32>, 8> (xyz normal into the removed side, w distance)
 *
 * Kept as a pure helper so the layout (which must match `picker.ts`'s WGSL
 * `Uniforms` struct and the main render's section/clip discards) is unit-testable
 * without a GPU device. Mirrors how `packClipPlanes` is shared + tested.
 */
import { packClipPlanes } from './clip-planes.js';
import type { PickClipState } from './types.js';

/** Float lane of the first clip-plane vec4. */
export const PICK_CLIP_PLANES_LANE = 24;

/**
 * Write the picker uniform block into `out` (>= 56 floats) and `outFlags` (a
 * Uint32 view of the same buffer at float lane 20 / byte 80). `clip` is the
 * section plane + clip planes the last render applied; an absent section /
 * empty plane list leaves its flag bits clear so picks aren't clipped.
 */
export function packPickUniforms(
  viewProj: Float32Array,
  clip: PickClipState | null | undefined,
  out: Float32Array,
  outFlags: Uint32Array,
): void {
  out.set(viewProj.subarray(0, 16), 0);
  const sp = clip?.sectionPlane;
  let flags = 0;
  if (sp) {
    out[16] = sp.normal[0];
    out[17] = sp.normal[1];
    out[18] = sp.normal[2];
    out[19] = sp.distance;
    flags |= 1; // sectionEnabled
    if (sp.flipped) flags |= 2; // flipped
  } else {
    out[16] = 0;
    out[17] = 0;
    out[18] = 0;
    out[19] = 0;
  }
  // clip planes at lanes 24-55; returns the enable bit (4) + count bits, or 0.
  flags |= packClipPlanes(clip?.clipPlanes, out, PICK_CLIP_PLANES_LANE);
  outFlags[0] = flags;
  outFlags[1] = 0;
  outFlags[2] = 0;
  outFlags[3] = 0;
}
