/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * BCF `ClippingPlane` <-> viewer conversion.
 *
 * BCF (visinfo.xsd) describes a clipping plane by a `Location` on the plane and
 * a `Direction` that "points in the invisible direction meaning the half-space
 * that is clipped". Several planes compose as the intersection of their kept
 * half-spaces. Both are in the project's world coordinates, Z-up, metres.
 *
 * Two viewer shapes map onto that:
 *   - {@link ViewerClippingPlane}: an exact plane (point + removed direction,
 *     viewer Y-up) — the viewer's clipping planes and a face-picked section.
 *   - {@link ViewerSectionPlane}: the Section tool's cardinal cut, a percentage
 *     along an axis, which needs the model bounds to become a location and is
 *     lossy on the way back (nearest axis).
 */

import type { BCFClippingPlane } from './types.js';
import { bcfToViewerCoords, viewerToBcfCoords, type Point3D } from './viewpoint-coords.js';
import type { ViewerBounds, ViewerSectionPlane } from './viewpoint.js';

/** An exact clipping plane in viewer coordinates (Y-up). `normal` points into the removed half. */
export interface ViewerClippingPlane {
  /** Any point on the plane. */
  point: Point3D;
  /** Direction of the removed half-space; need not be unit length. */
  normal: Point3D;
}

function unit(v: Point3D): Point3D | null {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(len) || len < 1e-9) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function finite(p: Point3D): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** Exact viewer plane -> BCF clipping plane; null for a degenerate normal or non-finite point. */
export function viewerClippingPlaneToBcf(plane: ViewerClippingPlane): BCFClippingPlane | null {
  const normal = unit(plane.normal);
  if (!normal || !finite(plane.point)) return null;
  return {
    location: viewerToBcfCoords(plane.point),
    direction: viewerToBcfCoords(normal),
  };
}

/** BCF clipping plane -> exact viewer plane; null for a degenerate direction or non-finite location. */
export function bcfClippingPlaneToViewer(plane: BCFClippingPlane): ViewerClippingPlane | null {
  const direction = unit(plane.direction);
  if (!direction || !finite(plane.location)) return null;
  return {
    point: bcfToViewerCoords(plane.location),
    normal: bcfToViewerCoords(direction),
  };
}

/**
 * Convert viewer section plane to BCF clipping plane
 *
 * ifc-lite uses percentage position (0-100) along an axis.
 * BCF uses absolute location and direction in world coordinates (Z-up).
 */
export function sectionPlaneToClippingPlane(
  sectionPlane: ViewerSectionPlane,
  bounds: ViewerBounds
): BCFClippingPlane | null {
  if (!sectionPlane.enabled) {
    return null;
  }

  // Calculate absolute position from percentage (in viewer coordinates)
  const t = sectionPlane.position / 100;

  let viewerLocation: Point3D;
  let viewerDirection: Point3D;

  switch (sectionPlane.axis) {
    case 'down': // Y axis (viewer up/down)
      viewerLocation = {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: bounds.min.y + t * (bounds.max.y - bounds.min.y),
        z: (bounds.min.z + bounds.max.z) / 2,
      };
      viewerDirection = sectionPlane.flipped ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 };
      break;

    case 'front': // Z axis (viewer depth)
      viewerLocation = {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: (bounds.min.y + bounds.max.y) / 2,
        z: bounds.min.z + t * (bounds.max.z - bounds.min.z),
      };
      viewerDirection = sectionPlane.flipped ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: -1 };
      break;

    case 'side': // X axis
      viewerLocation = {
        x: bounds.min.x + t * (bounds.max.x - bounds.min.x),
        y: (bounds.min.y + bounds.max.y) / 2,
        z: (bounds.min.z + bounds.max.z) / 2,
      };
      viewerDirection = sectionPlane.flipped ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 };
      break;
  }

  // Convert to BCF coordinates (Z-up)
  return {
    location: viewerToBcfCoords(viewerLocation),
    direction: viewerToBcfCoords(viewerDirection),
  };
}

/**
 * Convert BCF clipping plane to viewer section plane
 *
 * Determines the closest axis and calculates percentage position.
 * Converts from BCF coordinates (Z-up) to viewer coordinates (Y-up).
 */
export function clippingPlaneToSectionPlane(
  plane: BCFClippingPlane,
  bounds: ViewerBounds
): ViewerSectionPlane {
  // Convert from BCF coordinates to viewer coordinates
  const viewerLocation = bcfToViewerCoords(plane.location);
  const viewerDirection = bcfToViewerCoords(plane.direction);

  // Determine primary axis based on direction (in viewer coordinates)
  const absX = Math.abs(viewerDirection.x);
  const absY = Math.abs(viewerDirection.y);
  const absZ = Math.abs(viewerDirection.z);

  let axis: 'down' | 'front' | 'side';
  let position: number;
  let flipped: boolean;

  if (absY >= absX && absY >= absZ) {
    // Y axis dominant (down) in viewer
    axis = 'down';
    const range = bounds.max.y - bounds.min.y;
    position = range > 0 ? ((viewerLocation.y - bounds.min.y) / range) * 100 : 50;
    flipped = viewerDirection.y > 0;
  } else if (absZ >= absX) {
    // Z axis dominant (front) in viewer
    axis = 'front';
    const range = bounds.max.z - bounds.min.z;
    position = range > 0 ? ((viewerLocation.z - bounds.min.z) / range) * 100 : 50;
    flipped = viewerDirection.z > 0;
  } else {
    // X axis dominant (side)
    axis = 'side';
    const range = bounds.max.x - bounds.min.x;
    position = range > 0 ? ((viewerLocation.x - bounds.min.x) / range) * 100 : 50;
    flipped = viewerDirection.x > 0;
  }

  // Clamp position to valid range
  position = Math.max(0, Math.min(100, position));

  return {
    axis,
    position,
    enabled: true,
    flipped,
  };
}
