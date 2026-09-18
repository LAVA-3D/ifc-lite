/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The quad drawn for a clipping plane (docs/architecture/clipping-planes.md,
 * "UI"): the face of the kept region that lies on the plane, grown by
 * `CLIP_PLANE_OUTLINE_MARGIN` on every side.
 *
 * The quad is centred on the model, not on the point that was right-clicked:
 * it starts as a square around the foot of the model-bounds centre on the
 * plane, large enough to cover the bounds, then is clipped by the bounds
 * (padded by the margin) and by every other enabled plane (pushed outward by
 * the margin). Six planes that box in a small volume therefore draw six small
 * faces that overshoot each other by the margin, instead of six model-sized
 * sheets, and a lone plane draws the model's silhouette on that plane plus
 * the margin. A plane that misses the padded bounds altogether (dragged past
 * the model) keeps the big square so it stays visible and draggable.
 */

import { planeBasis } from '@ifc-lite/renderer';
import type { Bounds3, ClipPlaneState, Vec3Tuple } from './clip-plane-math.js';

/** How far the drawn quad reaches past the model bounds and past neighbouring planes, in metres. */
export const CLIP_PLANE_OUTLINE_MARGIN = 1;

interface HalfSpace {
  normal: Vec3Tuple;
  /** Points with `dot(p, normal) > distance` are cut away. */
  distance: number;
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Sutherland-Hodgman against one half-space; `[]` when nothing survives. */
function clipPolygon(poly: Vec3Tuple[], hs: HalfSpace): Vec3Tuple[] {
  if (poly.length === 0) return poly;
  const out: Vec3Tuple[] = [];
  const s = poly.map((p) => dot(p, hs.normal) - hs.distance);
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const a = poly[i], b = poly[j];
    const sa = s[i], sb = s[j];
    if (sa <= 0) out.push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** The six half-spaces of an AABB grown by `pad`. */
function boundsHalfSpaces(bounds: Bounds3, pad: number): HalfSpace[] {
  return [
    { normal: [1, 0, 0], distance: bounds.max.x + pad },
    { normal: [0, 1, 0], distance: bounds.max.y + pad },
    { normal: [0, 0, 1], distance: bounds.max.z + pad },
    { normal: [-1, 0, 0], distance: -(bounds.min.x - pad) },
    { normal: [0, -1, 0], distance: -(bounds.min.y - pad) },
    { normal: [0, 0, -1], distance: -(bounds.min.z - pad) },
  ];
}

/** Area-weighted centroid of a convex polygon (fan from vertex 0); the vertex mean for a degenerate one. */
function centroid(poly: Vec3Tuple[]): Vec3Tuple {
  let area = 0;
  const acc: Vec3Tuple = [0, 0, 0];
  for (let i = 1; i + 1 < poly.length; i++) {
    const a = poly[0], b = poly[i], c = poly[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const w = Math.hypot(cross[0], cross[1], cross[2]);
    area += w;
    acc[0] += (a[0] + b[0] + c[0]) * w;
    acc[1] += (a[1] + b[1] + c[1]) * w;
    acc[2] += (a[2] + b[2] + c[2]) * w;
  }
  if (area > 1e-12) return [acc[0] / (3 * area), acc[1] / (3 * area), acc[2] / (3 * area)];
  const n = poly.length || 1;
  return poly.reduce<Vec3Tuple>((m, p) => [m[0] + p[0] / n, m[1] + p[1] / n, m[2] + p[2] / n], [0, 0, 0]);
}

export interface ClipPlaneOutline {
  /** Convex polygon on the plane, world space, at least three vertices. */
  polygon: Vec3Tuple[];
  /** Where the drag gizmo sits: the polygon's centroid. */
  center: Vec3Tuple;
}

/**
 * The outline of `plane` given the other planes in the list and the model
 * bounds. Without bounds the quad is a `2 * fallbackHalf` square around the
 * foot of the origin. Disabled planes and `plane` itself are ignored.
 */
export function clipPlaneOutline(
  plane: ClipPlaneState,
  planes: readonly ClipPlaneState[],
  bounds: Bounds3 | null | undefined,
  margin: number = CLIP_PLANE_OUTLINE_MARGIN,
  fallbackHalf = 5,
): ClipPlaneOutline {
  const n = plane.normal;
  const { tangent: u, bitangent: v } = planeBasis(n);
  const target: Vec3Tuple = bounds
    ? [(bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2]
    : [0, 0, 0];
  const s = plane.distance - dot(target, n);
  const c: Vec3Tuple = [target[0] + n[0] * s, target[1] + n[1] * s, target[2] + n[2] * s];
  const half = bounds
    ? Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) / 2 + margin
    : fallbackHalf;
  const corner = (su: number, sv: number): Vec3Tuple => [
    c[0] + (u[0] * su + v[0] * sv) * half,
    c[1] + (u[1] * su + v[1] * sv) * half,
    c[2] + (u[2] * su + v[2] * sv) * half,
  ];
  const square: Vec3Tuple[] = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];

  let poly = square;
  if (bounds) {
    for (const hs of boundsHalfSpaces(bounds, margin)) poly = clipPolygon(poly, hs);
    // A plane past the padded bounds has no face there; keep it visible as the full square.
    if (poly.length < 3) poly = square;
  }
  for (const other of planes) {
    if (!other.enabled || other.id === plane.id) continue;
    const next = clipPolygon(poly, { normal: other.normal, distance: other.distance + margin });
    // Numerically parallel neighbours (an opposite wall) never trim; a plane that would vanish keeps its outline.
    if (next.length >= 3) poly = next;
  }
  return { polygon: poly, center: centroid(poly) };
}
