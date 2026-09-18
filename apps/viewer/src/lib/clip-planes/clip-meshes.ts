/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * CPU counterpart of the shader's clip-plane discard, for consumers that
 * work on mesh data rather than fragments (the 2D section generator). Each
 * plane keeps `dot(p, normal) <= distance`, so the drawing-2d half-space
 * clipper applies one plane at a time; meshes that vanish are dropped.
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { ClipPlane } from '@ifc-lite/renderer';
import { clipMeshesToHalfSpace } from '@ifc-lite/drawing-2d';

export function clipMeshesToClipPlanes(meshes: MeshData[], planes: readonly ClipPlane[]): MeshData[] {
  let kept = meshes;
  for (const plane of planes) {
    if (kept.length === 0) break;
    kept = clipMeshesToHalfSpace(
      kept,
      { x: plane.normal[0], y: plane.normal[1], z: plane.normal[2] },
      plane.distance,
    ).meshes;
  }
  return kept;
}
