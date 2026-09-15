/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ViewerBounds, ViewerSectionPlane } from '@ifc-lite/bcf';

export interface CapturedSectionPlane {
  axis: ViewerSectionPlane['axis'];
  worldPosition: number;
  flipped: boolean;
}

/** Preserve an absolute rendered cut through BCF's percentage/bounds input. */
export function capturedSectionPlaneInput(
  captured: CapturedSectionPlane,
  bounds: ViewerBounds | undefined,
): { sectionPlane: ViewerSectionPlane; bounds: ViewerBounds } {
  const axis = captured.axis === 'side' ? 'x' : captured.axis === 'down' ? 'y' : 'z';
  const source = bounds ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const range = source.max[axis] - source.min[axis];
  if (range !== 0) return {
    sectionPlane: { axis: captured.axis, flipped: captured.flipped, enabled: true,
      position: ((captured.worldPosition - source.min[axis]) / range) * 100 },
    bounds: source,
  };
  const adjusted = { min: { ...source.min }, max: { ...source.max } };
  adjusted.min[axis] = captured.worldPosition;
  adjusted.max[axis] = captured.worldPosition;
  return { sectionPlane: { axis: captured.axis, flipped: captured.flipped, enabled: true, position: 50 }, bounds: adjusted };
}
