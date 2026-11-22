import { controlClass } from '@/shared/ui/control-class';

export const CONNECTOR_SUBMIT_CLASS = controlClass({
  shape: 'chip',
  size: 'lg',
  tone: 'onAccent',
  className: 'border-transparent',
});
/** The same 32px step, so the row keeps one height. */
export const CONNECTOR_QUIET_CLASS = controlClass({
  shape: 'chip',
  size: 'lg',
  tone: 'muted',
  hoverInk: 'strong',
  hoverBorder: 'strong',
  className: 'border-transparent',
});
