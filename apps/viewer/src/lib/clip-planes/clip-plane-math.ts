/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The pure rules behind the clipping-plane list (docs/architecture/clipping-planes.md).
 *
 * Planes live in the viewer's Y-up render frame. Each keeps the half-space
 * `dot(p, normal) <= distance`; the normal points INTO the removed side, which
 * is both the renderer's clip convention and BCF's `Direction`. The kept
 * region is the intersection of every enabled plane.
 *
 * Three rules keep the list sane, and all three live here so the store, the
 * SDK and the tests share one implementation:
 *   - a new plane within `CLIP_PLANE_MERGE_DEGREES` of an existing SAME-direction
 *     plane replaces it (no near-duplicate planes);
 *   - a plane never moves closer than `CLIP_PLANE_MIN_GAP` to an opposite one
 *     (two walls of a box cannot cross);
 *   - the kept region must still intersect the model bounds (no empty view).
 */

import { MAX_CLIP_PLANES } from '@ifc-lite/renderer';
import { clipBoxToHalfSpace } from '@/lib/export/view-pdf/clip-box-half-space';

export type Vec3Tuple = [number, number, number];

export interface ClipPlaneState {
  id: string;
  /** Unit normal, pointing into the removed half-space. */
  normal: Vec3Tuple;
  /** `dot(pointOnPlane, normal)`. */
  distance: number;
  enabled: boolean;
  /** World point the plane was created from (before the outward push); anchors the gizmo. */
  anchor: Vec3Tuple;
}

export interface Bounds3 {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** Same-direction normals closer than this angle count as the same plane. */
export const CLIP_PLANE_MERGE_DEGREES = 2;
const MERGE_COS = Math.cos((CLIP_PLANE_MERGE_DEGREES * Math.PI) / 180);
/** Minimum slab thickness between two opposite planes, in metres. */
export const CLIP_PLANE_MIN_GAP = 0.01;
/** Outward push applied to a face-picked plane so the picked face stays visible, in metres. */
export const CLIP_PLANE_FACE_OFFSET = 0.001;
export { MAX_CLIP_PLANES };

export function normalizeVec3(v: readonly [number, number, number]): Vec3Tuple | null {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len < 1e-9) return null;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * The plane a face pick produces: through `point`, removing the side `normal`
 * points to, pushed `CLIP_PLANE_FACE_OFFSET` outward. `null` for a degenerate
 * normal or a non-finite point.
 */
export function planeFromFace(
  id: string,
  normal: readonly [number, number, number],
  point: readonly [number, number, number],
): ClipPlaneState | null {
  const n = normalizeVec3(normal);
  if (!n || !point.every(Number.isFinite)) return null;
  return {
    id,
    normal: n,
    distance: dot(point, n) + CLIP_PLANE_FACE_OFFSET,
    enabled: true,
    anchor: [point[0], point[1], point[2]],
  };
}

/** Index of the plane whose normal points the same way as `normal` (within the merge angle), else -1. */
export function sameDirectionIndex(planes: readonly ClipPlaneState[], normal: readonly number[]): number {
  return planes.findIndex((p) => dot(p.normal, normal) > MERGE_COS);
}

/** Every plane whose normal points the opposite way (within the merge angle). */
export function oppositePlanes(planes: readonly ClipPlaneState[], normal: readonly number[], exceptId?: string): ClipPlaneState[] {
  return planes.filter((p) => p.id !== exceptId && dot(p.normal, normal) < -MERGE_COS);
}

/**
 * The smallest distance plane `normal` may have so that it stays at least
 * `CLIP_PLANE_MIN_GAP` away from every opposite plane. With opposite normals
 * the kept slab is `-d_opposite <= dot(p, n) <= d`, so its thickness is
 * `d + d_opposite`. `-Infinity` when there is no opposite plane.
 */
export function minDistanceForGap(planes: readonly ClipPlaneState[], normal: readonly number[], exceptId?: string): number {
  let min = -Infinity;
  for (const opposite of oppositePlanes(planes, normal, exceptId)) {
    min = Math.max(min, CLIP_PLANE_MIN_GAP - opposite.distance);
  }
  return min;
}

/**
 * Whether the intersection of the enabled planes still meets `bounds`.
 * Clips the AABB by one half-space at a time; the clipper is conservative (it
 * returns the AABB of the surviving polytope), so a `true` here may be an
 * over-estimate but a `false` is certain. Without bounds nothing can be
 * checked and the answer is `true`.
 */
export function keptRegionIntersectsBounds(planes: readonly ClipPlaneState[], bounds: Bounds3 | null | undefined): boolean {
  if (!bounds) return true;
  let box: Bounds3 | null = { min: { ...bounds.min }, max: { ...bounds.max } };
  for (const plane of planes) {
    if (!plane.enabled) continue;
    box = clipBoxToHalfSpace(box, { x: plane.normal[0], y: plane.normal[1], z: plane.normal[2] }, plane.distance);
    if (!box) return false;
  }
  return true;
}

export type AddClipPlaneResult =
  | { ok: true; planes: ClipPlaneState[]; replacedId: string | null }
  | { ok: false; reason: 'degenerate' | 'crossing' | 'empty' | 'full' };

/**
 * The list after adding `candidate` under the three rules. A same-direction
 * plane is replaced in place (keeping list order); an opposite plane closer
 * than the gap, an empty kept region, or a full list is refused.
 */
export function addClipPlane(
  planes: readonly ClipPlaneState[],
  candidate: ClipPlaneState | null,
  bounds: Bounds3 | null | undefined,
): AddClipPlaneResult {
  if (!candidate) return { ok: false, reason: 'degenerate' };
  const replaceAt = sameDirectionIndex(planes, candidate.normal);
  if (replaceAt < 0 && planes.length >= MAX_CLIP_PLANES) return { ok: false, reason: 'full' };
  const replacedId = replaceAt >= 0 ? planes[replaceAt].id : null;
  if (candidate.distance < minDistanceForGap(planes, candidate.normal, replacedId ?? undefined)) {
    return { ok: false, reason: 'crossing' };
  }
  const next = replaceAt >= 0
    ? planes.map((p, i) => (i === replaceAt ? candidate : p))
    : [...planes, candidate];
  if (!keptRegionIntersectsBounds(next, bounds)) return { ok: false, reason: 'empty' };
  return { ok: true, planes: next, replacedId };
}

/**
 * The list after moving plane `id` to `distance`: clamped to the gap rule,
 * and left unchanged when the move would empty the kept region. Returns the
 * same array instance when nothing changes.
 */
export function moveClipPlane(
  planes: readonly ClipPlaneState[],
  id: string,
  distance: number,
  bounds: Bounds3 | null | undefined,
): ClipPlaneState[] {
  const index = planes.findIndex((p) => p.id === id);
  if (index < 0 || !Number.isFinite(distance)) return planes as ClipPlaneState[];
  const plane = planes[index];
  const clamped = Math.max(distance, minDistanceForGap(planes, plane.normal, id));
  if (clamped === plane.distance) return planes as ClipPlaneState[];
  const next = planes.map((p, i) => (i === index ? { ...p, distance: clamped } : p));
  return keptRegionIntersectsBounds(next, bounds) ? next : (planes as ClipPlaneState[]);
}

/** The foot of `anchor` on the live plane, so a gizmo stays glued to the cut as the plane moves. */
export function clipPlaneCenter(plane: Pick<ClipPlaneState, 'normal' | 'distance' | 'anchor'>): Vec3Tuple {
  const s = plane.distance - dot(plane.anchor, plane.normal);
  return [
    plane.anchor[0] + plane.normal[0] * s,
    plane.anchor[1] + plane.normal[1] * s,
    plane.anchor[2] + plane.normal[2] * s,
  ];
}
