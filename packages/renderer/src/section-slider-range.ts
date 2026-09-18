/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The range a cardinal section slider's 0..100% travels over: ONE policy for
 * every consumer of the cut.
 *
 * The viewer expresses the slider against the range it knows
 * (`coordinateInfo.shiftedBounds`, passed as `sectionPlane.min/max`), and so
 * do the 2D drawing it cuts, the 3D cap it lifts onto the plane, the BCF
 * viewpoint it exports and the PDF it prints. The GPU clip used to accept that
 * range only when it lay INSIDE the bounds of the meshes actually on the GPU,
 * and otherwise fell back to its own mesh range. The two ranges legitimately
 * differ: the renderer only holds the geometry the viewer uploads (type
 * visibility, view mode), and the two sides aggregate bounds differently. The
 * moment the viewer's range poked outside the mesh range by more than a
 * millimetre, the clip silently switched ranges while the cap and the drawing
 * did not, and the hatched cut floated a storey above the clipped geometry.
 *
 * The policy is therefore: honour the viewer's range whenever it is a usable
 * range that OVERLAPS the mesh range. A stale or partial range during
 * streaming is smaller and still overlaps, exactly as before. A degenerate
 * range (the `{0,0,0}` bounds a model starts with) is still refused, and so is
 * one in another frame entirely (unshifted large coordinates), which cannot
 * overlap; both were the failures the old containment rule guarded against.
 * A range WIDER than the meshes is now honoured: it is the whole model the
 * user is looking at, and hiding a type must not move the cut.
 */

/** A 1D range along the slider's axis. */
export interface SliderRange {
    min: number;
    max: number;
}

/** Slack in metres before an override counts as not overlapping the mesh range. */
const OVERLAP_SLACK = 1e-3;

/**
 * Resolve the slider range from the mesh-derived `projected` range and the
 * viewer's optional override.
 *
 * `unitsMatch` is false when the plane normal is no longer the unit axis the
 * override is expressed along (a rotated vertical cut, #2447); the override is
 * then in the wrong units and the projected range stands.
 */
export function resolveSectionSliderRange(
    projected: SliderRange,
    override: { min?: number; max?: number } | null | undefined,
    unitsMatch = true,
): SliderRange {
    const uiMin = override?.min;
    const uiMax = override?.max;
    if (
        unitsMatch &&
        uiMin !== undefined &&
        uiMax !== undefined &&
        Number.isFinite(uiMin) &&
        Number.isFinite(uiMax) &&
        uiMax - uiMin > 1e-6 &&
        uiMin <= projected.max + OVERLAP_SLACK &&
        uiMax >= projected.min - OVERLAP_SLACK
    ) {
        return { min: uiMin, max: uiMax };
    }
    return { min: projected.min, max: projected.max };
}

/** The world coordinate a slider percentage maps to inside `range`. */
export function sliderPositionInRange(range: SliderRange, position: number): number {
    return range.min + (position / 100) * (range.max - range.min);
}
