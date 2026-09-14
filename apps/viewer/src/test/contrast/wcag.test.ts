/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRgba, compositeOver, relativeLuminance, contrastRatio, contrastOfTextOnSurface } from './wcag';

describe('wcag contrast math', () => {
  it('parses rgb() and rgba() as Chromium serializes them', () => {
    assert.deepEqual(parseRgba('rgb(255, 255, 255)'), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseRgba('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  });

  it('black on white is the maximum ratio, 21:1', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };
    assert.ok(Math.abs(contrastRatio(black, white) - 21) < 0.01);
  });

  it('identical colors give the minimum ratio, 1:1', () => {
    const c = { r: 130, g: 140, b: 150, a: 1 };
    assert.equal(contrastRatio(c, c), 1);
  });

  it('relative luminance is order-independent for contrastRatio (both directions equal)', () => {
    const a = { r: 200, g: 50, b: 50, a: 1 };
    const b = { r: 20, g: 20, b: 200, a: 1 };
    assert.equal(contrastRatio(a, b), contrastRatio(b, a));
  });

  it('compositeOver blends a translucent foreground toward the backdrop', () => {
    const halfBlackOnWhite = compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    assert.ok(Math.abs(halfBlackOnWhite.r - 127.5) < 0.01);
    assert.equal(halfBlackOnWhite.a, 1);
  });

  it('relativeLuminance(white) is 1 and relativeLuminance(black) is 0', () => {
    assert.ok(Math.abs(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 }) - 1) < 1e-9);
    assert.equal(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 }), 0);
  });

  it('contrastOfTextOnSurface composites alpha before measuring — this is the exact defect #4783 exhibited: a text color equal to its surface, at any alpha, is invisible', () => {
    // rgba(0,0,0,1) text on rgb(0,0,0) surface, regardless of the text's own
    // alpha, always composites to the surface color: ratio 1 (invisible).
    const ratioOpaque = contrastOfTextOnSurface('rgb(20, 20, 30)', 'rgb(20, 20, 30)');
    const ratioTranslucent = contrastOfTextOnSurface('rgba(20, 20, 30, 0.8)', 'rgb(20, 20, 30)');
    assert.equal(ratioOpaque, 1);
    assert.equal(ratioTranslucent, 1);
  });
});
