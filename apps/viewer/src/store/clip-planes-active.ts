/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The clipping planes the renderer should apply this frame, in the renderer's
 * own shape. One shared empty array when nothing clips, so refs that watch it
 * do not churn.
 */

import type { ClipPlane } from '@ifc-lite/renderer';
import type { ClipPlaneState } from './slices/clipPlanesSlice.js';

const NONE: readonly ClipPlane[] = Object.freeze([]);

export function activeClipPlanes(state: {
  clipPlanes: readonly ClipPlaneState[];
  clipPlanesEnabled: boolean;
}): readonly ClipPlane[] {
  if (!state.clipPlanesEnabled) return NONE;
  const active = state.clipPlanes.filter((p) => p.enabled);
  if (active.length === 0) return NONE;
  return active.map((p) => ({ normal: p.normal, distance: p.distance }));
}
