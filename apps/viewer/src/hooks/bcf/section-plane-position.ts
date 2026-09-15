/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ViewerBounds, ViewerSectionPlane } from '@ifc-lite/bcf';

/** Convert an absolute rendered cut back through BCF's percentage input. */
export function sectionPlaneAtWorldPosition(
  sectionPlane: ViewerSectionPlane,
  bounds: ViewerBounds | undefined,
  worldPosition: number | undefined,
): ViewerSectionPlane {
  if (worldPosition === undefined || !bounds) return sectionPlane;
  const axis = sectionPlane.axis === 'side' ? 'x' : sectionPlane.axis === 'down' ? 'y' : 'z';
  const range = bounds.max[axis] - bounds.min[axis];
  return range === 0 ? sectionPlane : {
    ...sectionPlane,
    position: ((worldPosition - bounds.min[axis]) / range) * 100,
  };
}
