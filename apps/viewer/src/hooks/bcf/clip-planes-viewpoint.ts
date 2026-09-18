/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * BCF `ClippingPlanes` <-> the viewer's clipping planes and the Section tool.
 *
 * Export order (docs/architecture/clipping-planes.md): the Section tool's cut
 * when it is on screen — a face-picked cut with its EXACT normal, where the
 * cardinal slider cut keeps its existing bounds-based conversion — followed by
 * every enabled clipping plane. Import takes every plane exactly into the
 * clipping-plane list and never routes one into the Section tool.
 */

import type { ViewerClippingPlane } from '@ifc-lite/bcf';
import { customPlaneCenter } from '@/store';
import type { SectionPlane } from '@/store/types';
import type { ClipPlaneState } from '@/store/slices/clipPlanesSlice';

/** The exact planes to write: a custom section cut (if shown) then the enabled clipping planes. */
export function exportedClippingPlanes(
  shownSection: SectionPlane | null,
  state: { clipPlanes: readonly ClipPlaneState[]; clipPlanesEnabled: boolean },
): ViewerClippingPlane[] {
  const planes: ViewerClippingPlane[] = [];
  const custom = shownSection?.custom;
  if (custom) {
    // The renderer keeps `dot(p, n) <= d` unflipped and the other half when
    // flipped, so the removed direction is +n, or -n when flipped.
    const side = shownSection.flipped ? -1 : 1;
    const [cx, cy, cz] = customPlaneCenter(custom);
    planes.push({
      point: { x: cx, y: cy, z: cz },
      normal: { x: custom.normal[0] * side, y: custom.normal[1] * side, z: custom.normal[2] * side },
    });
  }
  if (state.clipPlanesEnabled) {
    for (const plane of state.clipPlanes) {
      if (!plane.enabled) continue;
      const [nx, ny, nz] = plane.normal;
      planes.push({
        point: { x: nx * plane.distance, y: ny * plane.distance, z: nz * plane.distance },
        normal: { x: nx, y: ny, z: nz },
      });
    }
  }
  return planes;
}

/** The store's input shape for an imported list. */
export function importedClippingPlanes(planes: readonly ViewerClippingPlane[]) {
  return planes.map((p) => ({
    normal: [p.normal.x, p.normal.y, p.normal.z] as const,
    point: [p.point.x, p.point.y, p.point.z] as const,
  }));
}
