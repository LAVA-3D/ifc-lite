/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_PREVIEW_MUTED_TEXT_CLASS,
  DOCUMENT_PREVIEW_PAPER_CLASS,
} from '../../components/viewer/document/preview-theme';
import { closeContrastBrowser, measureTextContrastOnSurface, type Theme } from './render-harness';
import { WCAG_AA_NORMAL_TEXT } from './wcag';

const THEMES: Theme[] = ['light', 'dark', 'colorful'];

after(async () => {
  await closeContrastBrowser();
});

describe('semantic text surfaces meet WCAG AA (#4792)', () => {
  for (const theme of THEMES) {
    it(`primary foreground clears AA on primary in ${theme}`, async () => {
      const ratio = await measureTextContrastOnSurface(theme, 'bg-primary', 'text-primary-foreground');
      assert.ok(ratio >= WCAG_AA_NORMAL_TEXT, `primary contrast was ${ratio.toFixed(2)}:1 in ${theme}`);
    });

    it(`muted foreground clears AA on muted in ${theme}`, async () => {
      const ratio = await measureTextContrastOnSurface(theme, 'bg-muted', 'text-muted-foreground', 'bg-background');
      assert.ok(ratio >= WCAG_AA_NORMAL_TEXT, `muted contrast was ${ratio.toFixed(2)}:1 in ${theme}`);
    });

    for (const textClass of [
      'text-neutral-900',
      'text-neutral-700',
      'text-neutral-500',
      DOCUMENT_PREVIEW_MUTED_TEXT_CLASS,
    ]) {
      it(`document preview ${textClass} clears AA on fixed paper in ${theme}`, async () => {
        const ratio = await measureTextContrastOnSurface(theme, DOCUMENT_PREVIEW_PAPER_CLASS, textClass);
        assert.ok(ratio >= WCAG_AA_NORMAL_TEXT, `document preview ${textClass} contrast was ${ratio.toFixed(2)}:1 in ${theme}`);
      });
    }

    it(`search empty-state text clears AA on its real popover surface in ${theme}`, async () => {
      const ratio = await measureTextContrastOnSurface(
        theme,
        'popover-surface bg-white dark:bg-zinc-800',
        'text-muted-foreground',
      );
      assert.ok(ratio >= WCAG_AA_NORMAL_TEXT, `search empty-state contrast was ${ratio.toFixed(2)}:1 in ${theme}`);
    });
  }
});
