import type { SessionListStatus } from './use-agent-sessions';

export type UnreadableReason = 'notFound' | 'timedOut' | 'failed' | 'unknownForm';

/**
 * What the status line says of the session-list read. `on` carries what is true right now, when
 * that is known: the list was read, or no Claude Code runs so nothing is. `hidden`: this system
 * never runs the read, so there is nothing to say or switch.
 */
export type SessionListLine =
  | { kind: 'hidden' }
  | { kind: 'off' }
  | { kind: 'on'; now: 'read' | 'noSession' | null }
  | { kind: 'unreadable'; reason: UnreadableReason };

export function sessionListLine(status: SessionListStatus): SessionListLine {
  switch (status) {
    case 'unsupported':
      return { kind: 'hidden' };
    case 'off':
      return { kind: 'off' };
    case 'pending':
      return { kind: 'on', now: null };
    case 'read':
    case 'noSession':
      return { kind: 'on', now: status };
    default:
      return { kind: 'unreadable', reason: status };
  }
}
