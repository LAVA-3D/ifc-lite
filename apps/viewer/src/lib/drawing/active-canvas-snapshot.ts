/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The mounted 2D drawing canvas is owned by `Drawing2DCanvas`, while BCF topic
 * controls live elsewhere in the viewer tree. This tiny registry exposes the
 * already-painted canvas without rebuilding the section in a second pipeline.
 */

let activeCanvas: HTMLCanvasElement | null = null;
let activeCanvasReady = false;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

/** Register the canvas that currently presents the 2D section. */
export function registerActiveDrawingCanvas(canvas: HTMLCanvasElement): () => void {
  activeCanvas = canvas;
  activeCanvasReady = false;
  notifyListeners();
  return () => {
    // A stale cleanup must not unregister a newer mounted canvas.
    if (activeCanvas === canvas) {
      activeCanvas = null;
      activeCanvasReady = false;
      notifyListeners();
    }
  };
}

/** Prevent an old bitmap from being paired with section state still updating. */
export function markActiveDrawingCanvasStale(): void {
  if (!activeCanvasReady) return;
  activeCanvasReady = false;
  notifyListeners();
}

/** Publish a canvas only after its paint effect has completed. */
export function markActiveDrawingCanvasRendered(canvas: HTMLCanvasElement, ready: boolean): void {
  if (activeCanvas !== canvas || activeCanvasReady === ready) return;
  activeCanvasReady = ready;
  notifyListeners();
}

/** Observe whether the section canvas is actually mounted and capturable. */
export function subscribeActiveDrawingCanvas(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React-compatible snapshot of the mounted canvas state. */
export function hasActiveDrawingCanvas(): boolean {
  return activeCanvasReady && activeCanvas !== null && activeCanvas.width > 0 && activeCanvas.height > 0;
}

/** Capture the exact painted 2D section, including its visible annotations. */
export function captureActiveDrawingSnapshot(): string | null {
  if (!activeCanvas || !hasActiveDrawingCanvas()) return null;
  const snapshot = activeCanvas.toDataURL('image/png');
  return snapshot.startsWith('data:image/png') ? snapshot : null;
}
