import type { AcpChatPanelProps } from '../ui/chat-panel/chat-panel-props';

export interface KeptPanel {
  key: string;
  props: AcpChatPanelProps;
  node: HTMLDivElement;
  seated: boolean;
  busy: boolean;
  readOnly: boolean;
  outlives: boolean;
  stop: (() => void) | null;
  held: boolean;
}

export type BusyReporter = (busy: boolean, readOnly?: boolean, outlives?: boolean, stop?: (() => void) | null) => void;

const NONE: readonly KeptPanel[] = [];
const SCREEN_BOUND = [
  'onMapIntent',
  'onPresentationOpenMap',
  'onPresentationVisibilityChange',
  'onHoverSlug',
  'onOntologyRelationPreviewChange',
  'onRuntimeChange',
  'onSuggestionAction',
  'onDraftPresenceChange',
  'onTurnToolActivityChange',
  'noticeActions',
  'beforeComposer',
] as const satisfies ReadonlyArray<keyof AcpChatPanelProps>;

let panels: readonly KeptPanel[] = NONE;
let parking: HTMLElement | null = null;
const listeners = new Set<() => void>();
const busyReporters = new Map<string, BusyReporter>();

function publish(next: readonly KeptPanel[]) {
  panels = next;
  for (const key of busyReporters.keys()) if (!next.some((panel) => panel.key === key)) busyReporters.delete(key);
  listeners.forEach((listener) => listener());
}

function patch(key: string, change: Partial<KeptPanel>) {
  if (!panels.some((panel) => panel.key === key)) return;
  publish(panels.map((panel) => (panel.key === key ? { ...panel, ...change } : panel)));
}

/** Whether a turn may keep running once its screen is gone (`parksTurns`). */
function mayRunAway(panel: KeptPanel): boolean {
  return panel.busy && (panel.props.parksTurns !== 'chosen' || panel.readOnly || panel.outlives);
}

function holdsFolder(panel: KeptPanel): boolean {
  return panel.busy && panel.outlives && !panel.readOnly;
}

function prune() {
  const kept = panels.filter((panel) => panel.seated || panel.held || mayRunAway(panel));
  if (kept.length === panels.length) return;
  for (const panel of panels) if (!kept.includes(panel)) panel.node.remove();
  publish(kept);
}

function readsOnly(panel: KeptPanel): boolean {
  return panel.busy && panel.readOnly;
}

function withoutRivals(key: string, props: AcpChatPanelProps): readonly KeptPanel[] {
  if (props.sessionEnabled === false) return panels;
  return panels.filter((panel) => {
    const rival = panel.key !== key && !panel.seated && !readsOnly(panel) && !holdsFolder(panel)
      && (!panel.busy || panel.props.vaultRoot === props.vaultRoot);
    if (rival) panel.node.remove();
    return !rival;
  });
}

export function awayProps(props: AcpChatPanelProps): AcpChatPanelProps {
  const away: AcpChatPanelProps = { ...props, putAway: true };
  for (const name of SCREEN_BOUND) delete away[name];
  return away;
}

/** Another conversation's turn holding this folder; a newcomer for it starts nothing until it ends. */
export function folderHolder(key: string, vaultRoot: string | null): KeptPanel | null {
  if (!vaultRoot) return null;
  return panels.find((panel) => panel.key !== key && holdsFolder(panel) && panel.props.vaultRoot === vaultRoot) ?? null;
}

export function keptAwayRuntimeId(): string | null {
  return panels.find((panel) => !panel.seated)?.props.runtimeId ?? null;
}

export const keptPanels = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  read: () => panels,
  readNone: () => NONE,
  park(element: HTMLElement | null) {
    parking = element;
    if (element) for (const panel of panels) if (!panel.seated) element.appendChild(panel.node);
  },
  seat(key: string, props: AcpChatPanelProps): HTMLDivElement {
    const rest = withoutRivals(key, props);
    const found = rest.find((panel) => panel.key === key);
    if (found) {
      publish(rest.map((panel) => (panel === found ? { ...found, props, seated: true, held: false } : panel)));
      return found.node;
    }
    const node = document.createElement('div');
    node.className = 'contents';
    node.dataset.keptAgentPanel = key;
    publish([...rest, { key, props, node, seated: true, busy: false, readOnly: false, outlives: false, stop: null, held: false }]);
    return node;
  },
  update(key: string, props: AcpChatPanelProps) {
    const rest = withoutRivals(key, props);
    publish(rest.map((panel) => (panel.key === key ? { ...panel, props } : panel)));
  },
  leave(key: string) {
    const panel = panels.find((candidate) => candidate.key === key);
    if (!panel) return;
    parking?.appendChild(panel.node);
    patch(key, { seated: false, held: mayRunAway(panel) });
    window.setTimeout(prune, 0);
  },
  busyReporter(key: string) {
    let reporter = busyReporters.get(key);
    if (!reporter) {
      reporter = (busy, readOnly = false, outlives = false, stop = null) => {
        patch(key, { busy, readOnly: busy && readOnly, outlives: busy && outlives, stop: busy ? stop : null });
      };
      busyReporters.set(key, reporter);
    }
    return reporter;
  },
  reset() {
    for (const panel of panels) panel.node.remove();
    busyReporters.clear();
    publish(NONE);
  },
};
