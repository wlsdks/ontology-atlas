import type { AcpChatPanelProps } from '../ui/chat-panel/types';

export interface KeptPanel {
  key: string;
  props: AcpChatPanelProps;
  node: HTMLDivElement;
  seated: boolean;
  busy: boolean;
  held: boolean;
}

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
const busyReporters = new Map<string, (busy: boolean) => void>();

function publish(next: readonly KeptPanel[]) {
  panels = next;
  for (const key of busyReporters.keys()) if (!next.some((panel) => panel.key === key)) busyReporters.delete(key);
  listeners.forEach((listener) => listener());
}

function patch(key: string, change: Partial<KeptPanel>) {
  if (!panels.some((panel) => panel.key === key)) return;
  publish(panels.map((panel) => (panel.key === key ? { ...panel, ...change } : panel)));
}

function prune() {
  const kept = panels.filter((panel) => panel.seated || panel.busy || panel.held);
  if (kept.length === panels.length) return;
  for (const panel of panels) if (!kept.includes(panel)) panel.node.remove();
  publish(kept);
}

function withoutRivals(key: string, props: AcpChatPanelProps): readonly KeptPanel[] {
  if (props.sessionEnabled === false) return panels;
  return panels.filter((panel) => {
    const rival = panel.key !== key && !panel.seated && (!panel.busy || panel.props.vaultRoot === props.vaultRoot);
    if (rival) panel.node.remove();
    return !rival;
  });
}

export function awayProps(props: AcpChatPanelProps): AcpChatPanelProps {
  const away: AcpChatPanelProps = { ...props, putAway: true };
  for (const name of SCREEN_BOUND) delete away[name];
  return away;
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
    publish([...rest, { key, props, node, seated: true, busy: false, held: false }]);
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
    patch(key, { seated: false, held: panel.busy });
    window.setTimeout(prune, 0);
  },
  busyReporter(key: string) {
    let reporter = busyReporters.get(key);
    if (!reporter) {
      reporter = (busy: boolean) => {
        patch(key, { busy });
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
