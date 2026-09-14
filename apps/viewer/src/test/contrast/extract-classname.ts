/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pulls a literal `className="..."` string out of a component's SOURCE by
 * matching the surrounding text (not a hardcoded expected value), so the
 * contrast tests in this directory measure whatever class the component
 * actually ships today — the same class a future edit could silently
 * change back to something unreadable, the way #4767 did to #4783's three
 * components. If the class ever becomes a template literal or a `cn(...)`
 * call, this throws instead of silently matching nothing.
 */

import { readFileSync } from 'node:fs';

/**
 * @param filePath Absolute path to the component source file.
 * @param anchor A literal substring that appears once, immediately before
 *   the `className="..."` to extract (e.g. a distinctive piece of JSX text
 *   or a preceding attribute).
 */
export function extractClassNameAfter(filePath: string, anchor: string): string {
  const src = readFileSync(filePath, 'utf-8');
  const anchorIndex = src.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error(`Anchor not found in ${filePath}: ${JSON.stringify(anchor)}`);
  }
  const rest = src.slice(anchorIndex + anchor.length);
  const m = rest.match(/className=(["'])(.*?)\1/s);
  if (!m) {
    throw new Error(
      `No literal className="..." found after anchor in ${filePath}: ${JSON.stringify(anchor)}. ` +
        `If this component switched to a template literal or cn(...), this extractor needs updating — ` +
        `do not hardcode the expected class instead, that reintroduces the untestable-string problem.`,
    );
  }
  return m[2];
}

/**
 * Like {@link extractClassNameAfter}, but for the first quoted string literal
 * after `anchor` — for a `cn('...', className)` call (`tooltip.tsx`'s
 * `TooltipContent`) rather than a plain JSX `className="..."` attribute.
 */
export function extractFirstStringLiteralAfter(filePath: string, anchor: string): string {
  const src = readFileSync(filePath, 'utf-8');
  const anchorIndex = src.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error(`Anchor not found in ${filePath}: ${JSON.stringify(anchor)}`);
  }
  const rest = src.slice(anchorIndex + anchor.length);
  const m = rest.match(/(['"`])(.*?)\1/s);
  if (!m) {
    throw new Error(`No string literal found after anchor in ${filePath}: ${JSON.stringify(anchor)}`);
  }
  return m[2];
}
