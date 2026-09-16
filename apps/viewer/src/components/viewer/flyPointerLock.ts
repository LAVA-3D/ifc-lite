/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The pointer lock fly mode holds while you look around, so the cursor stops
 * at no screen edge and cannot land on another window mid-gesture.
 *
 * Kept apart from `flyControls.ts` because it is the one piece that is pure
 * browser negotiation: an option not every engine knows, a promise not every
 * engine returns, and a refusal that must stay survivable.
 */

/**
 * The pointer-lock half of an element. `requestPointerLock` takes an options
 * argument only in newer Chromium, and returns a promise only there too, so
 * the DOM lib's signature is not the one every browser actually implements.
 */
export interface LockableElement {
  requestPointerLock?: (options?: { unadjustedMovement?: boolean }) => Promise<void> | void;
  ownerDocument: Document;
}

export interface FlyPointerLock {
  /** Remember the element to lock, without locking it yet. */
  arm(element: Element | null): void;
  /**
   * Take the lock, once. Called when the press has become a gesture — never
   * on the press itself: while the pointer is locked the browser fires no
   * `contextmenu` at all, so locking eagerly killed the right-click menu.
   */
  request(): void;
  /** True while this element actually holds the lock. */
  isLocked(): boolean;
  /** Release the lock and forget the element. */
  release(): void;
}

const warn = (error: unknown): void => {
  console.warn('[flyPointerLock] Pointer lock refused; looking with cursor deltas:', error);
};

export function createFlyPointerLock(): FlyPointerLock {
  let target: LockableElement | null = null;
  let requested = false;

  return {
    arm(element) {
      target = element ? (element as unknown as LockableElement) : null;
      requested = false;
    },

    request() {
      const el = target;
      if (!el || requested || typeof el.requestPointerLock !== 'function') return;
      requested = true;
      if (el.ownerDocument.pointerLockElement === el) return;
      try {
        // `unadjustedMovement` asks for raw device deltas, i.e. without the OS
        // mouse acceleration curve, so a slow sweep and a fast one turn the
        // same amount per centimetre of desk. Engines that do not know the
        // option reject the promise, so retry plainly; engines that do not
        // return a promise have nothing to retry.
        void Promise.resolve(el.requestPointerLock({ unadjustedMovement: true })).catch(() => {
          try {
            void Promise.resolve(el.requestPointerLock?.()).catch(warn);
          } catch (error) {
            warn(error);
          }
        });
      } catch (error) {
        warn(error);
      }
    },

    isLocked: () => target !== null && target.ownerDocument.pointerLockElement === target,

    release() {
      const doc = target?.ownerDocument;
      target = null;
      requested = false;
      if (doc?.pointerLockElement) doc.exitPointerLock();
    },
  };
}
