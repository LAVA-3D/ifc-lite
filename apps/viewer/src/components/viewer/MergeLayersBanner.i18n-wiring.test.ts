/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A revert of `apps/viewer/src/i18n/**` (#4785) is a whole-file delete: those
 * modules are new, so reverting them takes the files themselves, and any test
 * that reaches them through a static `import` dies at load
 * (`ERR_MODULE_NOT_FOUND`) before a single assertion runs. The revert oracle
 * (`scripts/check-test-revert-oracle.mjs`) correctly reports that as
 * REVERT-BROKE-BUILD / INCONCLUSIVE, not as coverage — see
 * `scripts/lib/revert-oracle.mjs`'s `SURGICAL_ADVICE`.
 *
 * `MergeLayersBanner.i18n.test.tsx` and `src/i18n/useTranslation.test.tsx`
 * both import the catalogue directly, so both die that way under a full
 * revert. This file is the surgical witness: it reads `MergeLayersBanner.tsx`
 * as TEXT, never as a module, so it has nothing to import from `@/i18n` and
 * keeps loading no matter what the revert set is. What it checks is narrower
 * than the render tests (wiring, not resolution or fallback), but a whole-file
 * revert of MergeLayersBanner.tsx also reverts its own content back to the
 * pre-#4785 hardcoded English strings, and this test would then fail on the
 * `assert.ok` below, not on import.
 */
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'MergeLayersBanner.tsx'), 'utf8');

it('MergeLayersBanner routes every user-facing string through the i18n catalogue, not a hardcoded literal (#4785)', () => {
  for (const key of [
    'mergeLayersBanner.titleEnabled',
    'mergeLayersBanner.titleDisabled',
    'mergeLayersBanner.subtitle',
    'mergeLayersBanner.reloadButton',
    'mergeLayersBanner.dismissAriaLabel',
  ]) {
    assert.ok(source.includes(`t('${key}')`), `expected MergeLayersBanner.tsx to call t('${key}')`);
  }
});
