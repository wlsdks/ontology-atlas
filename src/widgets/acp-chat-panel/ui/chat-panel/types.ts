import type { ReactNode } from 'react';
import type { useTranslations } from 'next-intl';

import type {
  AcpEvent,
  AcpMapIntent,
  AcpPresentationIntent,
  AcpTurnActivity,
  AcpTurnCompletion,
  AcpTurnStart,
  AcpTurnToolActivity,
  ChatSuggestion,
  InvestigationSendGuard,
  KnownRelations,
  TaskBaselineCaptureResult,
  useAcpSession,
} from '@/features/acp-session';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';

export type ChatT = ReturnType<typeof useTranslations<'acpChat'>>;
export type GrayT = ReturnType<typeof useTranslations<'grayArea'>>;

export type SessionState = ReturnType<typeof useAcpSession>;

export type FooterStatus = Exclude<SessionState['status'], 'idle'> | 'stopped' | 'awaiting';

/** A single ACP relation proposal that can be drawn on the map. Home resolves the vault slug into a real node id. */
export interface AcpOntologyRelationPreview {
  sourceSlug: string;
  targetSlug: string;
  relationType: string;
  phase: 'draft' | 'committing';
}

export interface OpeningRequest {
  text: string;
  nonce: number;
  scopeKey?: string;
  investigation?: InvestigationSendGuard;
}

interface DraftSnapshot {
  text: string;
  prefillNonce: number | null;
}

export interface DraftStore {
  read: () => DraftSnapshot;
  write: (draft: DraftSnapshot) => void;
}

export interface MeaningTransitionContext {
  handle: FileSystemDirectoryHandle;
  fileHandles: ReadonlyMap<string, FileSystemFileHandle>;
  writable: boolean;
}

export interface SeatedDetail {
  lead: string;
  detail: string;
  full: string;
}

export interface AnswerFold {
  request: string;
  line: string;
  doorLabel: string;
  onOpen: () => void;
}

export interface NoticeActions {
  openPage: (path: string) => void;
  askNext: () => void;
}

interface WriteJudgement {
  ok: boolean;
  problems: ReadonlyArray<{ code: string; message: string; line?: number }>;
}

export interface AcpChatPanelProps {
  runtimeId: string;
  runtimeLabel: string;
  vaultRoot: string | null;
  mcpServers?: unknown[];
  /** False renders the scaffold without starting the ACP process. */
  sessionEnabled?: boolean;
  resumeLatest?: boolean;
  putAway?: boolean;
  /** Only runtimes with a guard; with one entry there is nothing to choose. */
  runtimes?: ReadonlyArray<{ id: string; label: string }>;
  onRuntimeChange?: (runtimeId: string) => void;
  /** Seats a sentence in the box for the person to edit; it is never sent. */
  prefillRequest?: { text: string; nonce: number } | null;
  /** A first turn to send once the session is ready, on the person's behalf. */
  openingRequest?: OpeningRequest | null;
  requestScopeKey?: string;
  onOpeningRequestSent?: (nonce: number) => void;
  onOpeningRequestRejected?: (nonce: number) => void;
  /** Keeps the unsent sentence for a host that unmounts the panel; read once on mount. */
  draftStore?: DraftStore;
  /** Judges a file write before the person decides; null for a request it has no opinion on. */
  judgeWrite?: (request: {
    filePath: string | null;
    rawInput: Record<string, unknown>;
    toolKind: string | null;
  }) => WriteJudgement | null;
  /** Answers a file permission itself; a rejection is an answer too. */
  autoDecide?: (request: {
    filePath: string | null;
    rawInput: Record<string, unknown>;
    toolKind: string | null;
    toolName: string | null;
  }) => string | { reject: string } | null;
  suggestions?: readonly ChatSuggestion[];
  /** App-owned prerequisites such as opening source connection instead of drafting a prompt. */
  onSuggestionAction?: (suggestion: ChatSuggestion) => boolean;
  /** Only node names that exist are wired to the map. */
  knownSlugs?: ReadonlySet<string>;
  beforeComposer?: ReactNode;
  systemPromptAppendix?: string | null;
  noticeActions?: NoticeActions | null;
  knownRelations?: KnownRelations;
  /** Collapses every agent message of the turn whose request text matches exactly. */
  answerFold?: AnswerFold | null;
  presentationIntent?: AcpPresentationIntent | null;
  presentationRequest?: string | null;
  contextLabel?: string | null;
  composerSubject?: string | null;
  onDraftPresenceChange?: (present: boolean) => void;
  onPresentationOpenMap?: (slug: string, toolCallId: string) => void;
  onPresentationVisibilityChange?: (visible: boolean) => void;
  /** The caller holds this in a ref: rendering on every hover turns a large graph sticky. */
  onHoverSlug?: (slug: string | null) => void;
  onTurnActivityChange?: (activity: AcpTurnActivity | null) => void;
  onTurnToolActivityChange?: (activity: AcpTurnToolActivity | null) => void;
  onTerminalToolObservation?: (event: Extract<AcpEvent, { kind: 'tool' }>) => void;
  onMapIntent?: (intent: AcpMapIntent) => void;
  onOntologyRelationPreviewChange?: (preview: AcpOntologyRelationPreview | null) => void;
  onWorkReceipt?: (receipt: AcpWorkReceipt) => void;
  onTurnStarted?: (start: AcpTurnStart) => ((completion: AcpTurnCompletion) => void | Promise<void>) | null;
  captureTaskBaseline?: (turn: AcpTurnStart) => Promise<TaskBaselineCaptureResult>;
  meaningTransitionContext?: MeaningTransitionContext;
}
