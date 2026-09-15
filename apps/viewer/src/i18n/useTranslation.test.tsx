/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import '@/test/setup-dom.js';
import { it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { render, cleanup } from '@/test/render';
import { useTranslation } from './useTranslation';
import { registerLocale, setLocale } from './registry';

afterEach(() => {
  cleanup();
  setLocale('en');
});

function Probe({ tag }: { tag: string }) {
  const { t } = useTranslation();
  return <span data-key={tag}>{t('mergeLayersBanner.reloadButton')}</span>;
}

function DynamicProbe({ count }: { count: number }) {
  const { t } = useTranslation();
  return <>
    <span data-key="named">{t('appearanceAssignmentList.assignmentAriaLabel', {
      position: 3,
      sourceName: 'Brick',
      modelName: 'North Wing',
    })}</span>
    <span data-key="plural">{t('appearanceAssignmentList.summary', {
      count,
      productCount: count,
      excludedCount: 0,
      overriddenCount: 0,
    })}</span>
  </>;
}

it('resolves a key from the English catalogue by default', () => {
  const container = render(<Probe tag="default" />);
  const span = container.querySelector('span[data-key="default"]');
  assert.equal(span?.textContent, 'Reload');
});

it('falls back to English when the active locale is missing the key (#4785)', () => {
  // 'xx' deliberately omits 'mergeLayersBanner.reloadButton'.
  registerLocale('xx', { 'mergeLayersBanner.titleEnabled': 'XX enabled' });
  setLocale('xx');
  const container = render(<Probe tag="fallback" />);
  const span = container.querySelector('span[data-key="fallback"]');
  assert.equal(span?.textContent, 'Reload');
});

it('a translation deliberately set to an empty string is NOT treated as missing (#4785)', () => {
  // Distinguishes "translator left it blank on purpose" from "key absent".
  registerLocale('yy', { 'mergeLayersBanner.reloadButton': '' });
  setLocale('yy');
  const container = render(<Probe tag="blank" />);
  const span = container.querySelector('span[data-key="blank"]');
  assert.equal(span?.textContent, '');
});

it('re-renders mounted consumers when the active catalogue is replaced (#4785)', () => {
  registerLocale('replaceable', { 'mergeLayersBanner.reloadButton': 'First' });
  setLocale('replaceable');
  const container = render(<Probe tag="replacement" />);
  const span = container.querySelector('span[data-key="replacement"]');
  assert.equal(span?.textContent, 'First');

  act(() => {
    registerLocale('replaceable', { 'mergeLayersBanner.reloadButton': 'Second' });
  });
  assert.equal(span?.textContent, 'Second');
});

it('interpolates named values from a registered locale (#4785)', () => {
  registerLocale('de', {
    'appearanceAssignmentList.assignmentAriaLabel':
      'Zuweisung {position}: {sourceName} in {modelName}',
  });
  setLocale('de');
  const container = render(<DynamicProbe count={1} />);
  assert.equal(
    container.querySelector('[data-key="named"]')?.textContent,
    'Zuweisung 3: Brick in North Wing',
  );
});

it('selects locale plural categories beyond the English one/other rule (#4785)', () => {
  registerLocale('ru', {
    'appearanceAssignmentList.summary': {
      one: 'ONE {count}',
      few: 'FEW {count}',
      many: 'MANY {count}',
      other: 'OTHER {count}',
    },
  });
  setLocale('ru');

  const one = render(<DynamicProbe count={1} />);
  assert.equal(one.querySelector('[data-key="plural"]')?.textContent, 'ONE 1');
  cleanup();
  const few = render(<DynamicProbe count={2} />);
  assert.equal(few.querySelector('[data-key="plural"]')?.textContent, 'FEW 2');
  cleanup();
  const many = render(<DynamicProbe count={5} />);
  assert.equal(many.querySelector('[data-key="plural"]')?.textContent, 'MANY 5');
});

it('uses English plural rules when a plural message falls back to English (#4785)', () => {
  registerLocale('ru-fallback', {});
  setLocale('ru-fallback');
  const container = render(<DynamicProbe count={21} />);
  assert.match(container.querySelector('[data-key="plural"]')?.textContent ?? '', /^21 objects/);
});
