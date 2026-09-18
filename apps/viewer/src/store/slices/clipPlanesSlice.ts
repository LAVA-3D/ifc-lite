/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Clipping planes (docs/architecture/clipping-planes.md): up to eight
 * world-space half-spaces whose intersection is what the viewer shows.
 * Persistent viewer state, independent of the active tool — unlike the
 * Section tool's single cut, which only exists while that tool is open. Both
 * apply at once when both are on.
 *
 * Every rule (same-direction replacement, the opposite-pair gap, the
 * non-empty region) is a pure function in `lib/clip-planes/clip-plane-math`;
 * this slice only owns the list and applies them.
 */

import type { StateCreator } from 'zustand';
import { defineSliceTeardown, notApplicable } from '../teardown.js';
import {
  addClipPlane,
  moveClipPlane,
  planeFromFace,
  type AddClipPlaneResult,
  type Bounds3,
  type ClipPlaneState,
} from '../../lib/clip-planes/clip-plane-math.js';

export type { ClipPlaneState };

/** A plane as another tool describes it (BCF, SDK): a point on it and the removed direction. */
export interface ClipPlaneInput {
  normal: readonly [number, number, number];
  point: readonly [number, number, number];
}

export interface ClipPlanesSlice {
  clipPlanes: ClipPlaneState[];
  /** Master switch: keeps the list but stops clipping when false. */
  clipPlanesEnabled: boolean;
  /** Whether the on-canvas quads + drag handles are drawn. */
  clipPlaneHandlesVisible: boolean;

  /**
   * Add a plane through `point` removing the side `normal` points to (a
   * right-clicked face). `bounds` are the model bounds the non-empty rule
   * checks against; omit to skip that check.
   */
  addClipPlaneFromFace: (
    normal: readonly [number, number, number],
    point: readonly [number, number, number],
    bounds?: Bounds3 | null,
  ) => AddClipPlaneResult;
  /** Move a plane along its normal (drag gizmo). Clamped by the gap rule; ignored if it would empty the view. */
  setClipPlaneDistance: (id: string, distance: number, bounds?: Bounds3 | null) => void;
  removeClipPlane: (id: string) => void;
  clearClipPlanes: () => void;
  setClipPlanesEnabled: (enabled: boolean) => void;
  setClipPlaneHandlesVisible: (visible: boolean) => void;
  /**
   * Replace the whole list from another tool's description (a BCF viewpoint,
   * the SDK), applying the same rules one plane at a time in the given order.
   * No outward push: the planes are taken exactly. Returns how many were
   * dropped (degenerate, crossing, empty, or past the capacity).
   */
  replaceClipPlanes: (planes: readonly ClipPlaneInput[], bounds?: Bounds3 | null) => { dropped: number };
}

let nextClipPlaneId = 1;
function newClipPlaneId(): string {
  return `clip-${Date.now().toString(36)}-${nextClipPlaneId++}`;
}

function exactPlane(id: string, input: ClipPlaneInput): ClipPlaneState | null {
  const plane = planeFromFace(id, input.normal, input.point);
  if (!plane) return null;
  // planeFromFace pushes outward for a picked face; an imported plane is taken verbatim.
  const n = plane.normal;
  return { ...plane, distance: input.point[0] * n[0] + input.point[1] * n[1] + input.point[2] * n[2] };
}

export const createClipPlanesSlice: StateCreator<ClipPlanesSlice, [], [], ClipPlanesSlice> = (set, get) => ({
  clipPlanes: [],
  clipPlanesEnabled: true,
  clipPlaneHandlesVisible: true,

  addClipPlaneFromFace: (normal, point, bounds) => {
    const result = addClipPlane(get().clipPlanes, planeFromFace(newClipPlaneId(), normal, point), bounds);
    if (result.ok) set({ clipPlanes: result.planes, clipPlanesEnabled: true });
    return result;
  },

  setClipPlaneDistance: (id, distance, bounds) => {
    const planes = get().clipPlanes;
    const next = moveClipPlane(planes, id, distance, bounds);
    if (next !== planes) set({ clipPlanes: next });
  },

  removeClipPlane: (id) => set((state) => ({ clipPlanes: state.clipPlanes.filter((p) => p.id !== id) })),

  clearClipPlanes: () => set({ clipPlanes: [] }),

  setClipPlanesEnabled: (enabled) => set({ clipPlanesEnabled: enabled }),

  setClipPlaneHandlesVisible: (visible) => set({ clipPlaneHandlesVisible: visible }),

  replaceClipPlanes: (inputs, bounds) => {
    let planes: ClipPlaneState[] = [];
    let dropped = 0;
    for (const input of inputs) {
      const result = addClipPlane(planes, exactPlane(newClipPlaneId(), input), bounds);
      if (result.ok) planes = result.planes;
      else dropped++;
    }
    set({ clipPlanes: planes, clipPlanesEnabled: true });
    return { dropped };
  },
});

/**
 * Planes are positioned against the whole loaded scene, in world space, so
 * removing one model of a federation leaves them (they may still box in the
 * rest). A session reset or an empty scene drops them; the two switches are
 * user preferences for the session and survive a model swap.
 */
export const clipPlanesTeardown = defineSliceTeardown(
  'clipPlanesSlice',
  ['clipPlanes', 'clipPlanesEnabled', 'clipPlaneHandlesVisible'],
  {
    'session-reset': () => ({ clipPlanes: [] }),
    'model-removed': notApplicable,
    'all-models-cleared': () => ({ clipPlanes: [] }),
  },
);
