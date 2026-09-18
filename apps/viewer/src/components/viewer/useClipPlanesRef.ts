/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The clipping planes the animation loop hands the renderer each frame, as a
 * ref, plus a render request whenever the list changes. Kept out of
 * `Viewport.tsx` so the viewport only wires one ref through.
 */

import { useEffect, useMemo, type MutableRefObject } from 'react';
import type { ClipPlane, Renderer } from '@ifc-lite/renderer';
import { useViewerStore } from '@/store';
import { activeClipPlanes } from '@/store/clip-planes-active';
import { useLatestRef } from '../../hooks/useLatestRef.js';

export function useClipPlanesRef(rendererRef: MutableRefObject<Renderer | null>): MutableRefObject<readonly ClipPlane[]> {
  const clipPlanes = useViewerStore((s) => s.clipPlanes);
  const clipPlanesEnabled = useViewerStore((s) => s.clipPlanesEnabled);
  const active = useMemo(
    () => activeClipPlanes({ clipPlanes, clipPlanesEnabled }),
    [clipPlanes, clipPlanesEnabled],
  );
  const ref = useLatestRef(active);
  useEffect(() => {
    rendererRef.current?.requestRender();
  }, [active, rendererRef]);
  return ref;
}
