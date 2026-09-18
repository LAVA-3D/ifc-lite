/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Coordinate system conversion between the viewer and BCF.
 *
 * ifc-lite viewer uses Y-up coordinate system (typical WebGL):
 *   BCF.y = -Viewer.z  (viewer Z towards viewer = negative BCF Y forward)
 *   BCF.z = Viewer.y   (viewer Y up = BCF Z up)
 *
 * A pure axis swap: it applies to points and to directions alike.
 */

export type Point3D = { x: number; y: number; z: number };

/** Convert from viewer coordinates (Y-up) to BCF coordinates (Z-up). */
export function viewerToBcfCoords(p: Point3D): Point3D {
  return {
    x: p.x,
    y: -p.z,
    z: p.y,
  };
}

/** Convert from BCF coordinates (Z-up) to viewer coordinates (Y-up). */
export function bcfToViewerCoords(p: Point3D): Point3D {
  return {
    x: p.x,
    y: p.z,
    z: -p.y,
  };
}
