/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Clipping-plane uniform packing. Up to {@link MAX_CLIP_PLANES} world-space
 * half-spaces are written into the shared per-draw uniform as one vec4 lane
 * each (normal.xyz, distance.w); the shaders discard a fragment that lies on
 * the positive side of ANY plane, i.e. where `dot(p, normal) - distance > 0`.
 * The kept region is therefore the intersection of the half-spaces, which is
 * exactly how BCF `ClippingPlanes` compose (the `Direction` there points into
 * the removed half too).
 *
 * The axis-aligned {@link ClipBox} of `RenderOptions.clipBox` is a convenience
 * over the same mechanism: it is expanded into six planes at the boundary.
 *
 * Kept as a tiny pure helper so every write site (pipeline.updateUniforms, the
 * renderer's per-mesh and instanced template loops, the picker, the shadow
 * pass and the point-cloud uniforms) shares one layout and it stays
 * unit-testable without a GPU device.
 */
import type { ClipBox } from './types.js';

/** A world-space half-space: fragments with `dot(p, normal) - distance > 0` are removed. */
export interface ClipPlane {
  /** Unit normal pointing INTO the removed half-space. */
  normal: readonly [number, number, number];
  /** `dot(pointOnPlane, normal)`. */
  distance: number;
}

/** Uniform capacity: the WGSL `clipPlanes: array<vec4<f32>, 8>` lane count. */
export const MAX_CLIP_PLANES = 8;

/** flags bit marking at least one clip plane active. Must match the shaders (`& 4u`). */
export const CLIP_PLANES_ENABLED_BIT = 4;

/** The active plane count is packed into the flag word at this bit shift (`>> 8u`). */
export const CLIP_PLANE_COUNT_SHIFT = 8;

/** Number of planes encoded in a packed flag word. */
export function clipPlaneCount(flags: number): number {
  return (flags >>> CLIP_PLANE_COUNT_SHIFT) & 0xff;
}

/** Six outward-facing planes equivalent to an enabled AABB; empty when off. */
export function clipBoxToPlanes(box: ClipBox | null | undefined): ClipPlane[] {
  if (!box?.enabled) return [];
  return [
    { normal: [-1, 0, 0], distance: -box.min[0] },
    { normal: [0, -1, 0], distance: -box.min[1] },
    { normal: [0, 0, -1], distance: -box.min[2] },
    { normal: [1, 0, 0], distance: box.max[0] },
    { normal: [0, 1, 0], distance: box.max[1] },
    { normal: [0, 0, 1], distance: box.max[2] },
  ];
}

/**
 * The planes a frame actually clips with: explicit planes first, then the
 * expanded box, each renormalised, non-finite ones dropped, capped at
 * {@link MAX_CLIP_PLANES}. Returns the same empty array when nothing clips so
 * callers can test `.length` cheaply.
 */
export function resolveClipPlanes(
  planes: readonly ClipPlane[] | null | undefined,
  box?: ClipBox | null,
): ClipPlane[] {
  const out: ClipPlane[] = [];
  const push = (plane: ClipPlane) => {
    if (out.length >= MAX_CLIP_PLANES) return;
    const [nx, ny, nz] = plane.normal;
    const len = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(len) || len < 1e-9 || !Number.isFinite(plane.distance)) return;
    out.push({ normal: [nx / len, ny / len, nz / len], distance: plane.distance / len });
  };
  for (const plane of planes ?? []) push(plane);
  for (const plane of clipBoxToPlanes(box)) push(plane);
  return out;
}

/**
 * Write `planes` into `out` at float lanes [`floatOffset` .. +4*MAX_CLIP_PLANES),
 * one vec4 (normal.xyz, distance) per plane, zeroing the unused lanes so stale
 * data from a previous draw can't clip. Returns the flag bits to OR in: the
 * enabled bit plus the count at {@link CLIP_PLANE_COUNT_SHIFT}, or 0 when empty.
 * Planes beyond the capacity are ignored; callers resolve first.
 */
export function packClipPlanes(
  planes: readonly ClipPlane[] | null | undefined,
  out: Float32Array,
  floatOffset: number,
): number {
  const count = Math.min(planes?.length ?? 0, MAX_CLIP_PLANES);
  for (let i = 0; i < MAX_CLIP_PLANES; i++) {
    const lane = floatOffset + i * 4;
    if (i < count) {
      const plane = planes![i];
      out[lane] = plane.normal[0];
      out[lane + 1] = plane.normal[1];
      out[lane + 2] = plane.normal[2];
      out[lane + 3] = plane.distance;
    } else {
      out[lane] = 0;
      out[lane + 1] = 0;
      out[lane + 2] = 0;
      out[lane + 3] = 0;
    }
  }
  return count > 0 ? CLIP_PLANES_ENABLED_BIT | (count << CLIP_PLANE_COUNT_SHIFT) : 0;
}

/** True when the world point lies in the removed half of any plane. */
export function pointClippedByPlanes(
  planes: readonly ClipPlane[] | null | undefined,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!planes) return false;
  for (const plane of planes) {
    const [nx, ny, nz] = plane.normal;
    if (x * nx + y * ny + z * nz - plane.distance > 0) return true;
  }
  return false;
}
