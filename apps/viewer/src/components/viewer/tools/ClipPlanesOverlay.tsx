/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * On-canvas handles for the clipping planes (docs/architecture/clipping-planes.md).
 *
 * One translucent quad plus one arrow gizmo per plane, drawn as an SVG overlay
 * that re-projects every animation frame so it follows the camera — the same
 * approach as the Section tool's custom-plane gizmo. The quad is the plane's
 * face of the kept region (model bounds cut by the other planes) plus a
 * margin, so it is centred on the model and shrinks with a box of planes; see
 * `clipPlaneOutline`. The gizmo sits at the quad's centroid. Dragging the foot
 * circle slides the plane along its normal (cursor pixels → metres through
 * the projected length of a 1 m normal); the store applies the gap and
 * non-empty rules. Right-clicking a handle or a quad edge offers "Remove plane".
 *
 * Quads catch pointer events on their stroke only, so orbit / pan over a big
 * quad still reach the canvas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import type { ClipPlaneState } from '@/lib/clip-planes/clip-plane-math';
import { clipPlaneOutline } from '@/lib/clip-planes/clip-plane-outline';

const COLOR = '#0F9D8F';
const ARROW_PX = 56;

interface Projected {
  id: string;
  corners: { x: number; y: number }[];
  foot: { x: number; y: number };
  tip: { x: number; y: number };
}

function modelBounds() {
  return getGlobalRenderer()?.getModelBounds() ?? null;
}

/** Project every plane's outline, foot and arrow tip to CSS pixels; planes with an off-screen vertex are skipped. */
function projectPlanes(planes: readonly ClipPlaneState[]): Projected[] {
  const renderer = getGlobalRenderer();
  const camera = renderer?.getCamera();
  const canvas = renderer?.getCanvas();
  if (!camera || !canvas) return [];
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const bounds = renderer!.getModelBounds();
  const out: Projected[] = [];
  for (const plane of planes) {
    if (!plane.enabled) continue;
    const { polygon, center: c } = clipPlaneOutline(plane, planes, bounds);
    const corners = polygon.map((p) => camera.projectToScreen({ x: p[0], y: p[1], z: p[2] }, w, h));
    const foot = camera.projectToScreen({ x: c[0], y: c[1], z: c[2] }, w, h);
    const tip = camera.projectToScreen(
      { x: c[0] + plane.normal[0], y: c[1] + plane.normal[1], z: c[2] + plane.normal[2] }, w, h,
    );
    if (!foot || !tip || corners.some((p) => p === null)) continue;
    out.push({ id: plane.id, corners: corners as { x: number; y: number }[], foot, tip });
  }
  return out;
}

export function ClipPlanesOverlay() {
  const { t } = useTranslation();
  const planes = useViewerStore((s) => s.clipPlanes);
  const enabled = useViewerStore((s) => s.clipPlanesEnabled);
  const handlesVisible = useViewerStore((s) => s.clipPlaneHandlesVisible);
  const setDistance = useViewerStore((s) => s.setClipPlaneDistance);
  const removePlane = useViewerStore((s) => s.removeClipPlane);
  const [projected, setProjected] = useState<Projected[]>([]);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{
    id: string;
    startDistance: number;
    startCursor: { x: number; y: number };
    screenNormal: { x: number; y: number };
    pixelsPerMeter: number;
  } | null>(null);

  const active = enabled && handlesVisible && planes.some((p) => p.enabled);

  useEffect(() => {
    if (!active) { setProjected([]); return; }
    let raf = 0;
    const tick = () => {
      setProjected(projectPlanes(planes));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [active, planes]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const openMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ id, x: e.clientX, y: e.clientY });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGCircleElement>, p: Projected) => {
    if (e.button !== 0) return;
    const plane = planes.find((pl) => pl.id === p.id);
    if (!plane) return;
    const dx = p.tip.x - p.foot.x;
    const dy = p.tip.y - p.foot.y;
    const ppm = Math.hypot(dx, dy);
    if (ppm < 1e-3) return; // edge-on: a drag would be unstable
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: p.id,
      startDistance: plane.distance,
      startCursor: { x: e.clientX, y: e.clientY },
      screenNormal: { x: dx / ppm, y: dy / ppm },
      pixelsPerMeter: ppm,
    };
  }, [planes]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const along = (e.clientX - d.startCursor.x) * d.screenNormal.x + (e.clientY - d.startCursor.y) * d.screenNormal.y;
    setDistance(d.id, d.startDistance + along / d.pixelsPerMeter, modelBounds());
  }, [setDistance]);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }, []);

  if (!active) return null;

  return (
    <>
      <svg className="absolute inset-0 z-20" style={{ overflow: 'visible', pointerEvents: 'none' }}>
        {projected.map((p) => {
          const dx = p.tip.x - p.foot.x;
          const dy = p.tip.y - p.foot.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const tipX = p.foot.x + ux * ARROW_PX, tipY = p.foot.y + uy * ARROW_PX;
          const bx = tipX - ux * 8, by = tipY - uy * 8;
          return (
            <g key={p.id}>
              <polygon
                points={p.corners.map((c) => `${c.x},${c.y}`).join(' ')}
                fill={COLOR} fillOpacity="0.08"
                stroke={COLOR} strokeWidth="6" strokeOpacity="0.001"
                style={{ pointerEvents: 'stroke', cursor: 'context-menu' }}
                onContextMenu={(e) => openMenu(e, p.id)}
              />
              <polygon
                points={p.corners.map((c) => `${c.x},${c.y}`).join(' ')}
                fill="none" stroke={COLOR} strokeWidth="1.5" strokeOpacity="0.7" strokeDasharray="6 4"
              />
              <line x1={p.foot.x} y1={p.foot.y} x2={tipX} y2={tipY} stroke={COLOR} strokeWidth="3" strokeLinecap="round" opacity="0.85" />
              <polygon
                points={`${tipX},${tipY} ${bx - uy * 5},${by + ux * 5} ${bx + uy * 5},${by - ux * 5}`}
                fill={COLOR} opacity="0.9"
              />
              <circle
                cx={p.foot.x} cy={p.foot.y} r={9}
                fill={COLOR} fillOpacity="0.9" stroke="white" strokeWidth="2"
                style={{ pointerEvents: 'auto', cursor: 'grab' }}
                onPointerDown={(e) => onPointerDown(e, p)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onContextMenu={(e) => openMenu(e, p.id)}
              >
                <title>{t('clipPlanes.gizmo.dragTitle')}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      {menu && (
        <div
          className="fixed z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-40"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60"
            onClick={() => { removePlane(menu.id); setMenu(null); }}
          >
            {t('clipPlanes.context.remove')}
          </button>
        </div>
      )}
    </>
  );
}
