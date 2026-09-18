/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Ribbon · Home · "Clipping": the one toolbar entry for the clipping planes.
 * Planes are created from the entity context menu; this button only carries
 * the master switch, the handle visibility, "remove all" and a count badge.
 */

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Clipping } from '@/icons';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { MAX_CLIP_PLANES } from '@/lib/clip-planes/clip-plane-math';
import { RibbonLargeButton } from './primitives';

export function ClipPlanesRibbonButton() {
  const { t } = useTranslation();
  const count = useViewerStore((s) => s.clipPlanes.length);
  const enabled = useViewerStore((s) => s.clipPlanesEnabled);
  const handlesVisible = useViewerStore((s) => s.clipPlaneHandlesVisible);
  const setEnabled = useViewerStore((s) => s.setClipPlanesEnabled);
  const setHandlesVisible = useViewerStore((s) => s.setClipPlaneHandlesVisible);
  const clearPlanes = useViewerStore((s) => s.clearClipPlanes);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <RibbonLargeButton
          icon={Clipping}
          label={t('clipPlanes.ribbon.label')}
          tooltip={t('clipPlanes.ribbon.tooltip')}
          hasMenu
          active={enabled && count > 0}
          badge={count > 0 ? (
            <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground text-center">
              {count}
            </span>
          ) : undefined}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          {count > 0
            ? t('clipPlanes.menu.count', { count, max: MAX_CLIP_PLANES })
            : t('clipPlanes.menu.empty')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={enabled} onCheckedChange={(v) => setEnabled(v === true)}>
          {t('clipPlanes.menu.enable')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={handlesVisible} onCheckedChange={(v) => setHandlesVisible(v === true)}>
          {t('clipPlanes.menu.showHandles')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={count === 0} onSelect={() => clearPlanes()}>
          {t('clipPlanes.menu.removeAll')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
