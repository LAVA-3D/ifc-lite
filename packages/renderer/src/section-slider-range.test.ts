/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveSectionSliderRange, sliderPositionInRange } from './section-slider-range.js';

const MESH = { min: 0, max: 8 };

describe('resolveSectionSliderRange: one slider range for clip, cap and drawing', () => {
    it('honours a storey scope inside the mesh range', () => {
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: 2, max: 6 }), { min: 2, max: 6 });
    });

    it('honours a range WIDER than the meshes: the model the viewer sees is bigger than what the GPU holds', () => {
        // The floating-cap bug: the viewer cut the drawing and lifted the cap at
        // 47% of [-2, 14] while the clip fell back to 47% of the mesh range.
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: -2, max: 14 }), { min: -2, max: 14 });
    });

    it('honours a partial overlap either side', () => {
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: -5, max: 4 }), { min: -5, max: 4 });
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: 4, max: 20 }), { min: 4, max: 20 });
    });

    it('refuses a range in another frame (no overlap) and a degenerate one', () => {
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: 100, max: 120 }), MESH);
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: -20, max: -10 }), MESH);
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: 0, max: 0 }), MESH);
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: 6, max: 2 }), MESH);
    });

    it('refuses a missing or non-finite override', () => {
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, null), MESH);
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, undefined), MESH);
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: 2 }), MESH);
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: NaN, max: 6 }), MESH);
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: 2, max: Infinity }), MESH);
    });

    it('refuses an override in the wrong units', () => {
        assert.deepStrictEqual(resolveSectionSliderRange(MESH, { min: 2, max: 6 }, false), MESH);
    });

    it('returns a fresh object, never the projected range itself', () => {
        const projected = { min: 0, max: 8 };
        assert.notStrictEqual(resolveSectionSliderRange(projected, null), projected);
    });
});

describe('sliderPositionInRange', () => {
    it('maps the percentage linearly', () => {
        assert.strictEqual(sliderPositionInRange({ min: -2, max: 14 }, 0), -2);
        assert.strictEqual(sliderPositionInRange({ min: -2, max: 14 }, 50), 6);
        assert.strictEqual(sliderPositionInRange({ min: -2, max: 14 }, 100), 14);
    });
});
