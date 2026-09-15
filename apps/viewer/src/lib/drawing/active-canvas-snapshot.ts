/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The mounted 2D drawing canvas is owned by `Drawing2DCanvas`, while BCF topic
 * controls live elsewhere in the viewer tree. This tiny registry exposes the
 * already-painted canvas without rebuilding the section in a second pipeline.
 */

let activeCanvas: HTMLCanvasElement | null = null;

/** Register the canvas that currently presents the 2D section. */
export function registerActiveDrawingCanvas(canvas: HTMLCanvasElement): () => void {
  activeCanvas = canvas;
  return () => {
    // A stale cleanup must not unregister a newer mounted canvas.
    if (activeCanvas === canvas) activeCanvas = null;
  };
}

/** Capture the exact painted 2D section, including its visible annotations. */
export function captureActiveDrawingSnapshot(): string | null {
  if (!activeCanvas || activeCanvas.width === 0 || activeCanvas.height === 0) return null;
  const snapshot = activeCanvas.toDataURL('image/png');
  return snapshot.startsWith('data:image/png') ? snapshot : null;
}
