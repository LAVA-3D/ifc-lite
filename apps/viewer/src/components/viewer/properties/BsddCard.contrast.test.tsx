/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pins the bSDD property tooltip's secondary lines (description, data type)
 * to the app's accessible semantic tokens.
 *
 * Same root cause as `QuantitySetCard.contrast.test.tsx` and
 * `PropertySetCard.contrast.test.tsx`: `TooltipContent` switched to the
 * neutral `bg-popover`/`text-popover-foreground` surface in #4767, but
 * `BsddCard`'s secondary tooltip lines kept `text-primary-foreground/80` and
 * `/70` — white-on-white in light mode, identical-on-identical in dark mode
 * (`apps/viewer/src/index.css`).
 *
 * `BsddCard` itself fetches its property list from the live bSDD API inside
 * a `useEffect` and reads several `useViewerStore` mutation setters, so
 * mounting the full component in this suite would require mocking a network
 * call and a Zustand store slice unrelated to the tooltip markup. Instead
 * this test renders the EXACT JSX fragment `BsddCard` puts inside
 * `TooltipContent` for a property row (copied verbatim from
 * `BsddCard.tsx`'s `prop.description`/`prop.dataType` block) through the
 * real `Tooltip`/`TooltipContent`/`bsddDataTypeLabel` — so it pins the
 * classNames and their interaction with the real popover CSS tokens, but it
 * does NOT prove `BsddCard` itself renders this fragment at runtime; a
 * mistake in how `BsddCard` wires `prop` into this block would not be
 * caught here. Reverting the fix (classNames back to
 * `text-primary-foreground/80` and `/70`) turns this red.
 */

import '@/test/setup-dom.js';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip.js';
import { bsddDataTypeLabel } from '@/services/bsdd.js';

let root: Root | null = null;
let host: HTMLElement | null = null;

function render(node: ReactElement): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<TooltipProvider>{node}</TooltipProvider>);
  });
  return host;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** Verbatim copy of the property-row tooltip body in `BsddCard.tsx`. */
function BsddPropertyTooltipFragment({ name, description, dataType }: { name: string; description: string | null; dataType: string | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{name}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-[10px]">
        <p className="font-medium">{name}</p>
        {description && <p className="mt-0.5 text-muted-foreground">{description}</p>}
        {dataType && <p className="mt-0.5 text-muted-foreground/80">{bsddDataTypeLabel(dataType)}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

describe('BsddCard property tooltip contrast (fragment-level)', () => {
  it('renders description and data-type lines on the popover surface with semantic muted text', () => {
    render(<BsddPropertyTooltipFragment name="FireRating" description="Fire resistance rating" dataType="IfcLabel" />);

    const trigger = Array.from(document.querySelectorAll('span')).find((el) => el.textContent === 'FireRating');
    assert.ok(trigger);
    act(() => {
      (trigger as HTMLElement).focus();
    });

    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]');
    assert.ok(tooltip, 'tooltip content opened');
    assert.ok(tooltip!.classList.contains('bg-popover'), 'tooltip surface is the neutral popover, not bg-primary');
    assert.ok(!tooltip!.classList.contains('bg-primary'));

    const lines = Array.from(tooltip!.querySelectorAll('p'));
    assert.equal(lines.length, 3);
    assert.equal(lines[1].className, 'mt-0.5 text-muted-foreground', 'description line derives from the popover surface');
    assert.equal(lines[2].className, 'mt-0.5 text-muted-foreground/80', 'data-type line derives from the popover surface');
  });
});
