/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pins `CountBadgeTooltip`'s secondary-line classes to the app's
 * bg-primary/text-primary-foreground tooltip convention.
 *
 * The hover card over a storey's object-count badge renders inside
 * `TooltipContent`, whose surface is `bg-primary` (Tokyo Night blue,
 * `#7aa2f7` in BOTH themes) with `text-primary-foreground` — an INVERTED
 * surface, not a neutral panel. The secondary breakdown lines used to be
 * hardcoded `text-zinc-400 dark:text-zinc-500`, which measures at ~1.02:1
 * (light) and ~1.92:1 (dark) against that surface — both far below the
 * WCAG AA minimum of 4.5:1, which is what made them unreadable (user
 * report). This is a recurrence of issue #1218, which established the fix
 * for exactly this surface in `BsddCard`, `PropertySetCard` and
 * `QuantitySetCard`: derive secondary lines from `primary-foreground`
 * opacity tiers instead of a hardcoded neutral. `text-primary-foreground/80`
 * measures at 5.05:1 in dark mode (AA pass) and 2.13:1 in light mode — still
 * short of AA, because the tooltip surface's light-mode pairing (white on
 * `#7aa2f7`) caps even the fully-opaque headline at 2.52:1; that ceiling is
 * an app-wide tooltip-token defect out of this fix's scope (flagged
 * separately) and not something a secondary-line opacity tier can clear.
 *
 * This test asserts the class NAMES so a future edit can't silently
 * reintroduce a hardcoded neutral: reverting the fix (className reverted to
 * `text-zinc-400 dark:text-zinc-500`) turns this red.
 */

import '@/test/setup-dom.js';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, cleanup } from '@/test/render.js';
import { CountBadgeTooltip } from './CountBadgeTooltip.js';

afterEach(cleanup);

describe('CountBadgeTooltip contrast', () => {
  it('renders the headline at text-xs', () => {
    const container = render(<CountBadgeTooltip elementCount={5} lines={['5 objects', '3 Walls', '2 Doors']} />);
    const headline = container.querySelector('p');
    assert.equal(headline?.textContent, '5 objects');
    assert.equal(headline?.className, 'text-xs');
  });

  it('derives secondary lines from primary-foreground/80, not a hardcoded neutral', () => {
    const container = render(<CountBadgeTooltip elementCount={5} lines={['5 objects', '3 Walls', '2 Doors']} />);
    const secondaryLines = Array.from(container.querySelectorAll('p')).slice(1);
    assert.equal(secondaryLines.length, 2);
    for (const line of secondaryLines) {
      assert.equal(line.className, 'text-[10px] text-primary-foreground/80');
    }
  });
});
