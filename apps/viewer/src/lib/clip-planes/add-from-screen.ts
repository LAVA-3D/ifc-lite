/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Add clipping plane" from a screen position (the entity context menu).
 *
 * The context menu opened from a GPU pick that only knows the entity and the
 * screen point, so the face is resolved here with the exact CPU raycast the
 * Section tool's face pick uses. The plane removes the side the face normal
 * points to; the store applies the merge, gap and non-empty rules.
 */

import { getGlobalRenderer } from '@/hooks/useBCF';
import type { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { toast } from '@/components/ui/toast';
import { MAX_CLIP_PLANES } from './clip-plane-math.js';

type Translate = ReturnType<typeof useTranslation>['t'];

/** Add a plane through the face under the CSS-pixel point (clientX/clientY). */
export function addClipPlaneAtScreenPoint(clientX: number, clientY: number, t: Translate): void {
  const renderer = getGlobalRenderer();
  const canvas = renderer?.getCanvas();
  if (!renderer || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const state = useViewerStore.getState();
  const hit = renderer.raycastScene(clientX - rect.left, clientY - rect.top, {
    hiddenIds: state.hiddenEntities,
    isolatedIds: state.isolatedEntities,
  });
  if (!hit?.intersection) {
    toast.info(t('clipPlanes.toast.noFace'));
    return;
  }
  const { normal: n, point: p } = hit.intersection;
  const result = state.addClipPlaneFromFace([n.x, n.y, n.z], [p.x, p.y, p.z], renderer.getModelBounds());
  if (result.ok) {
    if (result.replacedId) toast.info(t('clipPlanes.toast.replaced'));
    return;
  }
  switch (result.reason) {
    case 'crossing': toast.error(t('clipPlanes.toast.crossing')); break;
    case 'empty': toast.error(t('clipPlanes.toast.empty')); break;
    case 'full': toast.error(t('clipPlanes.toast.full', { max: MAX_CLIP_PLANES })); break;
    default: toast.info(t('clipPlanes.toast.noFace'));
  }
}
