import { forwardRef } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

import { IconButton, type IconButtonProps } from './controls';
import { ICON_SIZE } from './icon-size';

export const OVERLAY_CLOSE_BOX = 'size-[var(--overlay-close-size)]';

export const OVERLAY_CLOSE_ICON_SIZE = ICON_SIZE.md;

type CloseButtonProps = Omit<IconButtonProps, 'children' | 'size' | 'tone' | 'hoverInk' | 'hoverSurface'>;

export const CloseButton = forwardRef<HTMLButtonElement, CloseButtonProps>(({ className, ...rest }, ref) => (
  <IconButton
    ref={ref}
    hoverInk="strong"
    hoverSurface="lift"
    className={cn(OVERLAY_CLOSE_BOX, className)}
    {...rest}
  >
    <X size={OVERLAY_CLOSE_ICON_SIZE} aria-hidden />
  </IconButton>
));
CloseButton.displayName = 'CloseButton';
