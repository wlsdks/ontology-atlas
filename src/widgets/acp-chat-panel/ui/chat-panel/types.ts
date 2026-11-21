import type { ReactNode } from 'react';
import type { useTranslations } from 'next-intl';

import type {
  AcpAutoDecision,
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
import type { AcpWorkReceipt } from '@/shared/lib/meaning-transition/acp-work-receipt';

import type { ToolLabel } from '../tool-label';
import type { TurnActivityKind } from '../turn-activity';

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

export type AcpTurnRequestAction = 'edit' | 'delete' | 'execute' | 'read' | 'ontology' | 'unknown';

export interface AcpTurnRequest {
  action: AcpTurnRequestAction;
  target: string | null;
}

/** What the running turn is doing, in the words its transcript row uses; `asking` while a permission card waits. */
export interface AcpTurnWork {
  kind: TurnActivityKind;
  label: ToolLabel | null;
  target: string | null;
  asking: boolean;
  request?: AcpTurnRequest | null;
  stopping?: boolean;
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

/** A request pressed while the agent starts; it goes out once, to the runtime and folder it was written for. */
export interface HeldRequest {
  text: string;
  lead: string;
  seatedDetail: SeatedDetail | null;
  runtimeId: string;
  vaultRoot: string | null;
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
  prefillRequest?: { text: string; nonce: number } | null;
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
  /** Answers a file permission itself, reading what it needs at the request; a rejection is an answer too. */
  autoDecide?: (request: {
    filePath: string | null;
    rawInput: Record<string, unknown>;
    toolKind: string | null;
    toolName: string | null;
  }) => AcpAutoDecision | Promise<AcpAutoDecision>;
  suggestions?: readonly ChatSuggestion[];
  onSuggestionAction?: (suggestion: ChatSuggestion) => boolean;
  knownSlugs?: ReadonlySet<string>;
  beforeComposer?: ReactNode;
  systemPromptAppendix?: string | null;
  noticeActions?: NoticeActions | null;
  /** Current graph relation keys (`from\0type\0to`) used to reject invented presentation edges. */
  knownRelations?: KnownRelations;
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
  /** The exact active tool snapshot; callers must not derive a target from agent prose. */
  onTurnToolActivityChange?: (activity: AcpTurnToolActivity | null) => void;
  onTerminalToolObservation?: (event: Extract<AcpEvent, { kind: 'tool' }>) => void;
  /** The map move named by the exact input of an Atlas read tool, never by agent prose (`acp-session/model/map-presentation/map-intent.ts`). */
  onMapIntent?: (intent: AcpMapIntent) => void;
  onOntologyRelationPreviewChange?: (preview: AcpOntologyRelationPreview | null) => void;
  onWorkReceipt?: (receipt: AcpWorkReceipt) => void;
  onTurnStarted?: (start: AcpTurnStart) => ((completion: AcpTurnCompletion) => void | Promise<void>) | null;
  onTurnStopChange?: (stop: (() => void) | null) => void;
  onTurnWorkChange?: (work: AcpTurnWork | null) => void;
  /**
   * Which running turns keep going once the screen leaves: `chosen` keeps a read-only turn and one
   * `turnOutlivesScreen` chose at its start; any other turn ends with the screen.
   */
  parksTurns?: 'any' | 'chosen';
  turnReadOnly?: (turn: AcpTurnStart) => boolean;
  turnOutlivesScreen?: (turn: AcpTurnStart) => boolean;
  /**
   * Another conversation's turn holds this folder: this one starts no agent, resumes and sends
   * nothing, and offers that turn's Stop until it ends.
   */
  folderBusy?: { stop: () => void } | null;
  captureTaskBaseline?: (turn: AcpTurnStart) => Promise<TaskBaselineCaptureResult>;
  meaningTransitionContext?: MeaningTransitionContext;
  /**
   * `readOnly` and `outlives` are the running turn's own flags, so they hold whichever screen seats
   * the panel; `stop` is its enforced Stop.
   */
  onBusyChange?: (busy: boolean, readOnly: boolean, outlives: boolean, stop: (() => void) | null) => void;
}
