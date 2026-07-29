"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  buildOntologyInsightsReturnHref,
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  parseInsightsReturnMarker,
  parseOntologyStudioEditParam,
} from "@/entities/knowledge-graph";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { findSimilarNodeByTitle, type SimilarNodeCandidate } from "@/shared/lib/similar-node-title";
import { LG_BREAKPOINT_PX, useViewportBelow } from "@/shared/lib/use-viewport-below";
import { requestSettingsView } from "@/shared/lib/settings-view-intent";
import { useAgentDockDefaultOpen } from "@/shared/lib/use-agent-dock-default";
import { isLlmChatBridgeAvailable } from "@/shared/lib/tauri-llm";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import type { ScreenContextSnapshot } from "@/features/vault-agent";
import { VaultAgentPanel } from "@/widgets/vault-agent-panel";
import { STUDIO_AGENT_DOCK_MIN_VIEWPORT_PX } from "../lib/studio-agent-dock";
import { EmptyState, useToast } from "@/shared/ui";
import {
  buildStudioItem,
  selectDefaultStudioNodeId,
  BEARING_FRONTMATTER_KEY,
  type StudioBearing,
  type StudioRelation,
} from "../lib/build-studio-item";
import {
  buildCreateNodeDoc,
  buildCreateNodeSlug,
  buildEditPacket,
  buildFillPacket,
  buildMcpPacket,
  buildRemovePacket,
  candidateFromNode,
  findCreateSlugCollision,
  kindExpectsDomain,
  type CreateCandidate,
  type CreateDraft,
  type CreateNodeKind,
  type CreateOrigin,
  type PendingRelation,
} from "../lib/build-create-node";
import {
  isRelationEditableFromFocal,
  projectBearings,
  reduceStudioChanges,
  summarizeStudioChanges,
  type StudioChange,
  type StudioSummaryVocab,
} from "../lib/build-studio-changes";
import {
  resolveMaterializedNodeId,
  resolveStudioWriteTarget,
  type StudioWriteTarget,
} from "../lib/resolve-write-target";
import {
  useStudioNavigate,
  useStudioSearchParams,
} from "../lib/use-studio-search-params";
import { buildMaterializeDraft, planStudioCommit } from "../lib/plan-studio-commit";
import { buildPickerDiscovery } from "../lib/build-picker-discovery";
import { buildDeltaPreview } from "../lib/build-delta-preview";
import {
  resolveStudioEnhanceFocal,
  resolveStudioFocalId,
} from "../lib/resolve-studio-focal";
import { studioHasDeepLinkIntent } from "../lib/entry-choice";
import {
  planPracticeCleanup,
  practiceStep,
  practiceStepIndex,
  type PracticeArtifact,
} from "../lib/studio-practice-guide";
import { allowedKindsFor } from "../lib/allowed-kinds";
import { candidateMatches } from "../lib/match-candidate";
import { clearCreateDraft, readCreateDraft, saveCreateDraft } from "../lib/create-draft-store";
import {
  clearStudioDraft,
  readStudioDraft,
  saveStudioDraft,
  useStudioDrafts,
} from "../lib/studio-draft-store";
import { StudioCompass, type CompassBearingView, type StudioCompassLabels } from "./StudioCompass";
import { StudioEntryChoice } from "./StudioEntryChoice";
import { StudioPracticeCleanup } from "./StudioPracticeCleanup";
import { StudioPracticeRail } from "./StudioPracticeRail";
import { StudioTooNarrow } from "./StudioTooNarrow";
import { StudioMaterializeDialog, type StudioMaterializeLabels } from "./StudioMaterializeDialog";

/**
 * `/ontology/studio` — the 나침 무대 (Compass Stage), the vault WRITE surface.
 * ONE surface, two fill-states (no mode tabs):
 *   - default            an existing node, partially filled (`?node=<id>`).
 *   - `?mode=create`     an all-empty new node.
 * See `StudioCompass` for the visual contract and `build-studio-item` for the
 * bearing-grouping data model.
 */


const CREATE_KINDS: CreateNodeKind[] = ["project", "domain", "capability", "element"];

/**
 * 저장이 **서명을 마치는** 시간 — 수렴 칩의 확정 모션(`--motion-settle` 240ms)
 * 이 끝나고 결과물이 한 프레임이라도 보이는 데 필요한 창. 마무리 질문은 그
 * 뒤에 온다. 총 지연은 Doherty 임계(400ms) 안이다.
 */
const PRACTICE_SIGNATURE_MS = 260;

const RELATIONS: StudioRelation[] = ["isA", "dependsOn", "contains", "relates"];
const BEARING_OF: Record<StudioRelation, StudioBearing> = {
  isA: "up",
  dependsOn: "right",
  contains: "down",
  relates: "left",
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  return [];
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function StudioStage({
  practiceSaved,
  onPracticeSaved,
  agentDock,
}: {
  /** 실습 저장이 이미 끝났나 — 안내 띠를 접고 마무리에 자리를 넘긴다. */
  practiceSaved: boolean;
  /** 쓰기가 성공한 **그 순간** 되돌리기 표를 바깥으로 올린다. */
  onPracticeSaved: (artifact: PracticeArtifact) => void;
  /**
   * 오른쪽 도크의 여닫기 — 껍질이 소유한 상태를 무대 헤더의 버튼과 잇는다.
   * `null` 이면 도크가 설 수 없는 자리라 버튼도 그리지 않는다.
   */
  agentDock: { open: boolean; toggle: () => void } | null;
}) {
  const t = useTranslations("ontologyStudio");
  const tAgentPanel = useTranslations("vaultAgentPanel");
  const locale = useLocale();
  // C12③ — the secondary display-name locale is the OTHER of the two app locales.
  const secondaryLocale = locale === "en" ? "ko" : "en";
  const searchParams = useStudioSearchParams();
  const navigateStudio = useStudioNavigate();
  const router = useRouter();
  const { insight } = useOntologyInsight();
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const kindLabel = useOntologyKindLabel();
  const toast = useToast();
  // ② 폭 강등 — 나침 무대는 고정 폭 카드 + 위성 기하라 <lg 에서 성립하지
  // 않는다. 판정은 여기 한 번, 적용은 모든 분기 앞에서 한 번 (아래 참조).
  const narrowViewport = useViewportBelow(LG_BREAKPOINT_PX);

  const isCreate = searchParams.get("mode") === "create";
  // 실습 모드 — 생성 무대 위에 안내 띠를 얹고, 저장 뒤 「지울까요?」로 닫는다.
  const isPractice = searchParams.get("practice") === "1";
  const requestedNode = searchParams.get("node");
  // #1 — the entry choice moment shows ONLY on a bare `/ontology/studio` open.
  // Any deep-link intent (mode/node/from/edit, or an insights review return)
  // carries a decision already, so it skips the choice entirely (pure gate in
  // lib so the deep-link-skip contract is unit-tested).
  const hasStudioDeepLink = studioHasDeepLinkIntent(searchParams);
  const [choiceDismissed, setChoiceDismissed] = useState(false);
  const [stageInitialFocus, setStageInitialFocus] = useState<"heading" | null>(
    null,
  );
  const clearStageInitialFocus = useCallback(
    () => setStageInitialFocus(null),
    [],
  );
  const insightsReturnTab = parseInsightsReturnMarker(
    searchParams.get(ONTOLOGY_DEEPLINK_VIA_KEY),
  );
  const insightsReviewId = insightsReturnTab
    ? searchParams.get(ONTOLOGY_DEEPLINK_REVIEW_KEY)
    : null;
  const nodes = useMemo(() => insight?.nodes ?? [], [insight]);
  const edges = useMemo(() => insight?.edges ?? [], [insight]);
  const writable = mode === "local" && localVault.status === "loaded";

  const candidates = useMemo<CreateCandidate[]>(() => nodes.map((n) => candidateFromNode(n)), [nodes]);
  const similarCandidates = useMemo<SimilarNodeCandidate[]>(
    () => candidates.map((c) => ({ slug: c.ref, title: c.title, kind: c.kind })),
    [candidates],
  );
  const domains = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === "domain")
        .map((n) => ({ value: n.id.replace(/^domain:/, ""), title: n.display ?? n.title })),
    [nodes],
  );

  /**
   * 진행 캡션 — 네 방위 중 몇 개를 채웠나.
   *
   * 2026-07-28 QA: `filled >= 1` 이 곧바로 "반쯤 왔어요" 였다. **1/4(25%)과
   * 2/4(50%)가 같은 문장**을 썼다는 뜻이다. 하나 채운 사람에게 "반쯤" 이라
   * 말하면 그건 격려가 아니라 **틀린 사실**이고, 두 번째를 채웠을 때 캡션이
   * 안 바뀌므로 **진전이 안 보인다** — 이 표면의 중독은 파티클이 아니라
   * "다음 할 일 → 즉시 반영 → 진전 누적" 의 루프에서 온다는 헌장과 정면으로
   * 어긋난다.
   */
  const flowHint = useCallback(
    (filled: number) =>
      filled >= 4
        ? t("flowHint.done")
        : filled >= 3
          ? t("flowHint.almost")
          : filled >= 2
            ? t("flowHint.half")
            : filled >= 1
              ? t("flowHint.first")
              : t("flowHint.start"),
    [t],
  );

  const questionFor = useCallback((relation: StudioRelation) => t(`question.${relation}`), [t]);
  const laneLabelFor = useCallback((relation: StudioRelation) => t(`laneLabel.${relation}`), [t]);
  const emptyHintFor = useCallback((relation: StudioRelation) => t(`emptyHint.${relation}`), [t]);

  const labels: StudioCompassLabels = useMemo(
    () => ({
      searchPlaceholder: t("searchPlaceholder"),
      // 지도 칩과 **같은 키** — 이름이 바뀌면 두 표면이 함께 바뀐다.
      agentDock: tAgentPanel("title"),
      exit: insightsReturnTab ? t("returnToReview") : t("exit"),
      moreRelations: t("moreRelations"),
      flowEyebrow: t("flowEyebrow"),
      flowCount: (filled, total) => `${t("flowCount", { filled, total })} ${flowHint(filled)}`,
      domainMembership: (domain) => t("domainMembership", { domain }),
      framePrompt: (name) => (isCreate ? t("create.framePrompt") : t("framePrompt", { name })),
      guideBadge: t("guideBadge"),
      bottomProgress: (filled, total) =>
        `${t("bottomProgress", { filled, total })} ${filled >= total ? t("bottomDone") : t("bottomRemain", { remain: total - filled })}`,
      save: t("save"),
      saveHint: t("saveHint"),
      foldMore: () => t("foldMore"),
      foldTitle: (label, total) => t("foldTitle", { label, total }),
      addMore: (label) => t("addMore", { label }),
      addMoreShort: t("addMoreShort"),
      defMore: t("defMore"),
      defLess: t("defLess"),
      pickerTitle: (question) => question,
      pickerSub: t("picker.sub"),
      pickerPlaceholder: t("picker.placeholder"),
      pickerEmpty: t("picker.empty"),
      pickerBrowseEmpty: t("picker.browseEmpty"),
      pickerKind: (kindLabelText) => kindLabelText,
      pickerCreateNew: t("picker.createNew"),
      suggestHeading: t("picker.suggestHeading"),
      browseHeading: t("picker.browseHeading"),
      reasonSameDomain: t("picker.reasonSameDomain"),
      reasonTitleSimilar: t("picker.reasonTitleSimilar"),
      reasonAdjacent: t("picker.reasonAdjacent"),
      browseBack: t("picker.browseBack"),
      browseNoDomain: t("picker.browseNoDomain"),
      similarSuggest: (title) => t("picker.similar", { title }),
      similarAccept: t("picker.similarAccept"),
      createKindLabel: t("kindLabel"),
      createNamePlaceholder: t("create.namePlaceholder"),
      createDomainNone: t("create.domainNone"),
      createDefinitionPlaceholder: t("create.definitionPlaceholder"),
      createSimilar: (title, kindLabelText) => t("create.similar", { title, kind: kindLabelText }),
      createSlugCollision: (title, kindLabelText) =>
        t("create.slugCollision", { title, kind: kindLabelText }),
      createSlugCollisionHint: t("create.slugCollisionHint"),
      createSimilarOpen: t("create.similarOpen"),
      createSimilarAnyway: t("create.similarAnyway"),
      // Slice 1 — edit existing relations
      edit: t("edit"),
      editTitle: t("editTitle"),
      close: t("preview.close"),
      editRetypeHeading: t("editRetypeHeading"),
      editMoveTo: (bearingLabelText) => t("editMoveTo", { bearing: bearingLabelText }),
      editDelete: t("editDelete"),
      editDeleteConfirm: t("editDeleteConfirm"),
      editDeleteYes: t("editDeleteYes"),
      editDeleteCancel: t("editDeleteCancel"),
      editElsewhere: (other) => t("editElsewhere", { other }),
      editElsewhereGo: t("editElsewhereGo"),
      pendingBadge: t("pendingBadge"),
      // Slice 2 — record summary + commit
      summaryUndo: t("summaryUndo"),
      commitEmptyHint: t("commitEmptyHint"),
      // Slice 4 — 나침반 산책 (compass walk)
      walkTo: t("walkTo"),
      walkBackAria: (name) => t("walkBackAria", { name }),
      // #68 — 작업중 목록
      draftsOpen: (count) => t("drafts.open", { count }),
      draftsOpenAria: (count) => t("drafts.openAria", { count }),
      draftsTitle: t("drafts.title"),
      draftsHint: t("drafts.hint"),
      draftsCloseAria: t("drafts.closeAria"),
      draftsCount: (count) => t("drafts.count", { count }),
      draftsResume: t("drafts.resume"),
      draftsDiscard: t("drafts.discard"),
      draftsDiscardAria: (name) => t("drafts.discardAria", { name }),
      draftsCurrent: t("drafts.current"),
      draftsEmpty: t("drafts.empty"),
      // Slice 5 — 그래프 델타 미니뷰 (save preview)
      previewOpen: t("preview.open"),
      previewTitle: t("preview.title"),
      previewCloseAria: t("preview.closeAria"),
      previewClose: t("preview.close"),
      previewCenterNew: t("preview.centerNew"),
      previewMovedChip: t("preview.movedChip"),
      previewRemovedChip: t("preview.removedChip"),
      previewOverflow: (count) => t("preview.overflow", { count }),
      previewLegendExisting: t("preview.legendExisting"),
      previewLegendAdded: t("preview.legendAdded"),
      previewLegendMoved: t("preview.legendMoved"),
      previewLegendRemoved: t("preview.legendRemoved"),
    }),
    [t, tAgentPanel, isCreate, flowHint, insightsReturnTab],
  );

  // Plain-language record summary vocab — one bag serving both ko + en and both
  // modes (enhance / create). Shared by the "이렇게 기록됩니다" panel.
  const relationShort = useCallback((relation: StudioRelation) => t(`relationShort.${relation}`), [t]);
  const summaryVocab: StudioSummaryVocab = useMemo(
    () => ({
      relationLabel: relationShort,
      addLine: (relationLabelText, title) => t("summary.addLine", { relation: relationLabelText, title }),
      moveLine: (title, toLabel) => t("summary.moveLine", { title, relation: toLabel }),
      removeLine: (relationLabelText, title) => t("summary.removeLine", { relation: relationLabelText, title }),
      enhanceHeadline: (name, count) => t("summary.enhanceHeadline", { name, count }),
      enhanceFileEffect: () => t("summary.enhanceFileEffect"),
      createHeadline: (kindLabelText, name, domainLabelText) =>
        domainLabelText
          ? t("summary.createHeadlineDomain", { kind: kindLabelText, name, domain: domainLabelText })
          : t("summary.createHeadline", { kind: kindLabelText, name }),
      createFileEffect: (count) => t("summary.createFileEffect", { count }),
      createCollapsed: (count) => t("summary.createCollapsed", { count }),
      createOriginLine: (name, relation) => t("summary.createOriginLine", { name, relation }),
      collapsedCount: (count) => t("summary.collapsed", { count }),
      empty: t("summary.empty"),
    }),
    [t, relationShort],
  );

  const enterCreate = useCallback(
    () => navigateStudio(new URLSearchParams({ mode: "create" })),
    [navigateStudio],
  );
  /**
   * 실습 시작 — 생성 모드와 **같은 무대**로 들어간다. 별도의 실습 화면을 만들지
   * 않는 것이 요점이다: 연습용 화면에서 배운 조작은 진짜 화면에서 한 번 더
   * 배워야 하고, 그러면 실습이 아니라 예고편이 된다.
   */
  const enterPractice = useCallback(
    () => navigateStudio(new URLSearchParams({ mode: "create", practice: "1" })),
    [navigateStudio],
  );
  const exit = useCallback(
    () =>
      router.push(
        insightsReturnTab
          ? buildOntologyInsightsReturnHref(
              insightsReturnTab,
              insightsReviewId,
            )
          : "/topology/",
      ),
    [router, insightsReturnTab, insightsReviewId],
  );
  const openNode = useCallback(
    (id: string) => navigateStudio(new URLSearchParams({ node: id })),
    [navigateStudio],
  );

  // Candidate picker for a relation — allowed kinds (per bearing × focal kind,
  // C12 ①), minus already-linked / self.
  const makeCandidatesFor = useCallback(
    (
      relation: StudioRelation,
      focalKind: string | null,
      query: string,
      exclude: ReadonlySet<string>,
    ): CreateCandidate[] => {
      const allow = allowedKindsFor(relation, focalKind);
      return candidates
        .filter((c) => allow.has(c.kind))
        .filter((c) => !exclude.has(c.id))
        // #66 — 표시 이름뿐 아니라 canonical title 과 ref 까지 정규화해 본다.
        // 예전엔 `c.title`(= display) 만 봐서 `display_ko` 가 달린 노드를 원문
        // 이름으로 검색할 수 없었다.
        .filter((c) => candidateMatches(c, query))
        .slice(0, 8);
    },
    [candidates],
  );

  // Near-dup nudge in the picker — the user typed the exact name of an existing node.
  const makeSimilarFor = useCallback(
    (
      relation: StudioRelation,
      focalKind: string | null,
      query: string,
      exclude: ReadonlySet<string>,
    ): CreateCandidate | null => {
      const q = normalize(query);
      if (q.length < 2) return null;
      const allow = allowedKindsFor(relation, focalKind);
      return (
        candidates.find(
          (c) => allow.has(c.kind) && !exclude.has(c.id) && normalize(c.title) === q,
        ) ?? null
      );
    },
    [candidates],
  );

  // ── 문서 없는 개념의 동의 게이트 ────────────────────────────────────────
  // 관계는 개념에 속하는데, 남의 frontmatter 에서 이름만 불린 개념은 자기
  // `.md` 가 없다. 그런 개념에 관계를 이으려면 문서를 만드는 수밖에 없고,
  // 사용자 디스크의 파일 생성은 동의 없이 하지 않는다. 저장 순간 한 번 묻고,
  // 답이 올 때까지 commit 을 붙잡아 둔다 — 그래야 "저장하고 이동" 이 동의
  // 이후의 실제 성공 여부를 그대로 이어받는다.
  const [docConsent, setDocConsent] = useState<{
    target: Extract<StudioWriteTarget, { status: "missing" }>;
    settle: (kind: CreateNodeKind | null) => void;
  } | null>(null);
  const askDocConsent = useCallback(
    (target: Extract<StudioWriteTarget, { status: "missing" }>) =>
      new Promise<CreateNodeKind | null>((resolve) => {
        setDocConsent({
          target,
          settle: (chosen) => {
            setDocConsent(null);
            resolve(chosen);
          },
        });
      }),
    [],
  );

  const materializeLabels = useCallback(
    (name: string): StudioMaterializeLabels => ({
      title: t("materialize.title"),
      reason: t("materialize.reason", { name }),
      action: writable ? t("materialize.actionWrite") : t("materialize.actionCopy"),
      fileLabel: t("materialize.fileLabel"),
      kindLabel: t("materialize.kindLabel"),
      kindPrompt: t("materialize.kindPrompt"),
      scopeNote: writable ? t("materialize.scopeNote") : t("materialize.scopeNoteCopy"),
      confirm: writable ? t("materialize.confirmWrite") : t("materialize.confirmCopy"),
      cancel: t("materialize.cancel"),
      closeAria: t("materialize.closeAria"),
      kindOptionLabel: (k) => kindLabel(k),
    }),
    [t, writable, kindLabel],
  );

  // ─────────────────────────────── CREATE state ──────────────────────────
  /**
   * 생성 초안은 세션에 보관된다 — 나갔다 돌아와도 그대로다(`create-draft-store`).
   * 딥링크로 들어온 맥락(`createContext`)이 있으면 아래 render-time 시드가
   * 이기므로, 여기서는 보관본을 초기값으로만 쓴다.
   */
  // lazy initializer 로 **첫 렌더에 한 번만** 읽는다 — ref 를 렌더 중에 읽으면
  // lint 가 막고(정당하다: 렌더는 순수해야 한다), 매 렌더 읽으면 세션 저장소를
  // 계속 두드린다.
  const [restored] = useState(readCreateDraft);
  const [kind, setKind] = useState<CreateNodeKind>(restored?.kind ?? "capability");
  const [title, setTitle] = useState(restored?.title ?? "");
  const [domainValue, setDomainValue] = useState<string | null>(restored?.domainValue ?? null);
  const [definition, setDefinition] = useState(restored?.definition ?? "");
  const [relations, setRelations] = useState<PendingRelation[]>(restored?.relations ?? []);
  const [similarDismissed, setSimilarDismissed] = useState(false);
  // C12③ — optional other-locale display name (primary name is the current locale).
  const [secondaryName, setSecondaryName] = useState(restored?.secondaryName ?? "");

  // C2 — CREATE opened from a socket carries the origin (A --relation--> new) and
  // a name prefill via ?from & ?rel & ?name. Resolve A tolerantly; malformed /
  // stale context is simply ignored (falls back to a blank CREATE).
  const createContext = useMemo(() => {
    if (!isCreate) return null;
    const from = searchParams.get("from");
    const rel = searchParams.get("rel");
    if (!from || !rel || !(RELATIONS as string[]).includes(rel)) return null;
    const originId = resolveStudioFocalId(from, nodes);
    if (!originId) return null;
    const originNode = nodes.find((n) => n.id === originId);
    if (!originNode) return null;
    return {
      originId,
      originLabel: originNode.display ?? originNode.title,
      originKind: originNode.kind,
      // A 자신도 자기 문서가 없을 수 있다 — 그러면 A→새 노드 관계를 A 를 인용한
      // 남의 문서에 적게 된다. 쓰기 대상은 여기서도 같은 판정을 거친다.
      originWriteTarget: resolveStudioWriteTarget(originNode),
      relation: rel as StudioRelation,
      name: searchParams.get("name") ?? "",
    };
  }, [isCreate, searchParams, nodes]);

  // Seed the CREATE draft from the origin context ONCE per context (React's
  // "reset state during render when input changes" pattern — same as the enhance
  // focal reset below). kind is pre-filtered to the bearing's allowed target kinds.
  const [prevCreateCtxKey, setPrevCreateCtxKey] = useState<string | null>(null);
  // **나가는 순간을 잡지 않는다.** 「그만하기」·레일 이동·창 닫기·새로고침 —
  // 나가는 길은 여럿이고 하나를 빼먹으면 그 길로만 초안이 사라진다. 대신 값이
  // 바뀔 때마다 보관하면 어느 길로 나가든 지켜진다.
  useEffect(() => {
    if (!isCreate) return;
    saveCreateDraft({ title, kind, domainValue, definition, secondaryName, relations });
  }, [isCreate, title, kind, domainValue, definition, secondaryName, relations]);

  const createCtxKey = createContext
    ? `${createContext.originId}|${createContext.relation}|${createContext.name}`
    : null;
  if (isCreate && createCtxKey !== prevCreateCtxKey) {
    setPrevCreateCtxKey(createCtxKey);
    if (createContext) {
      setTitle(createContext.name);
      const allowed = allowedKindsFor(createContext.relation, createContext.originKind);
      setKind(CREATE_KINDS.find((k) => allowed.has(k)) ?? "capability");
      setDomainValue(null);
      setDefinition("");
      setRelations([]);
      setSecondaryName("");
      setSimilarDismissed(false);
    }
  }

  // ─────────────────────────────── ENHANCE staged changes ────────────────
  // Which existing node the enhance stage is centered on (deeplink or default).
  // Declared up here so the reset effect keeps a stable hook order across the
  // create/enhance early return.
  // C3 — resolve `?node=` tolerantly (canonical / folder-prefixed / bare tail /
  // NFD). A raw `n.id === requestedNode` missed every non-canonical form a
  // LOCAL vault produces, so a search click silently kept the default node.
  // 요청한 노드가 없으면 다른 노드로 갈아끼우지 않는다 — 판정은 순수 함수
  // 한 곳에서만 한다(`resolveStudioEnhanceFocal`).
  const { focalId: enhanceFocalId, requestedMissing: rawRequestedMissing } = useMemo(
    () => resolveStudioEnhanceFocal(requestedNode, nodes, edges),
    [requestedNode, nodes, edges],
  );

  // 방금 만든 문서로 옮겨 가는 중 — 매니페스트 재적재와 주소 변경이 같은
  // 프레임에 도착하지 않으면 그 사이 한 프레임 동안 "이 개념을 못 찾겠다" 가
  // 보인다. 방금 우리가 쓴 파일이므로 그건 죽은 링크가 아니다. 그래프가
  // 새 문서를 알아보는 순간 스스로 걷힌다.
  const [materializing, setMaterializing] = useState<{ slug: string; kind: CreateNodeKind } | null>(
    null,
  );
  const materializedFocalId = materializing
    ? resolveMaterializedNodeId(materializing.slug, materializing.kind, nodes)
    : null;
  // 그래프가 새 문서를 알아본 순간 스스로 걷힌다 — 효과가 아니라 렌더 중
  // 상태 조정(같은 파일의 `prevFocalId` 리셋과 같은 React 권장 패턴).
  if (materializing && materializedFocalId !== null && nodes.some((n) => n.id === materializedFocalId)) {
    setMaterializing(null);
  }
  const requestedNodeMissing = rawRequestedMissing && materializing === null;
  const openingMaterialized = rawRequestedMissing && materializing !== null;

  // Slice 2 — enhance is STAGED: fills / retypes / deletes accumulate here and
  // only land on "확인하고 저장". Reset whenever the focal node changes so a new
  // node never inherits another node's pending edits — the React-recommended
  // "reset state during render when a prop changes" pattern (no effect).
  // 저장 전 변경은 localStorage 초안으로 자동 보존된다 — 레일 이동 · 뒤로가기 ·
  // 창 닫기 어디로 빠져나가도 사라지지 않는다(#60).
  //
  // 초기값은 반드시 빈 배열이다. useState 초기화에서 localStorage 를 읽으면
  // 정적 export 의 서버 HTML(초안 없음)과 첫 클라이언트 렌더(초안 있음)가 갈려
  // hydration 이 깨진다 — 복원은 마운트 뒤 효과에서 한다(아래).
  const [changes, setChanges] = useState<StudioChange[]>([]);
  const [prevFocalId, setPrevFocalId] = useState(enhanceFocalId);
  // Slice 4 — 나침반 산책. Remember the node we just walked FROM so the new stage
  // can (a) offer a quiet "← <이전 노드>" back affordance and (b) briefly highlight
  // the came-from satellite for arrival orientation. Captured here (not from
  // browser history) so the label always matches where the highlight lands.
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  if (prevFocalId !== enhanceFocalId) {
    setCameFrom(prevFocalId);
    setPrevFocalId(enhanceFocalId);
    // 새 노드로 옮길 때 이전 노드의 편집을 물려받지 않는다. 다만 이제 "버린다"가
    // 아니라 "그 노드의 초안으로 갈아끼운다" — 산책해서 돌아오면 그대로 있다.
    setChanges(enhanceFocalId ? readStudioDraft(enhanceFocalId) : []);
  }

  // 마운트/포컬 변경 후 초안 복원. 위 render-time 리셋이 산책을 덮고, 이 효과는
  // 첫 진입(새로고침·딥링크·다른 화면에서 복귀)을 덮는다. hydration 이 끝난 뒤
  // 실행되므로 서버 HTML 과 어긋나지 않는다.
  useEffect(() => {
    if (!enhanceFocalId) return;
    const draft = readStudioDraft(enhanceFocalId);
    if (draft.length > 0) setChanges(draft);
  }, [enhanceFocalId]);

  // #68 — '작업중이던 것' 목록. 초안은 노드 id 로만 키를 잡으므로 다른 vault 로
  // 바꾸면 그 id 가 그래프에 없다 — 현재 그래프와의 교집합만 보여주면 별도
  // vault 식별자 없이도 자연히 격리된다.
  const allDrafts = useStudioDrafts();
  const visibleDrafts = useMemo(() => {
    const known = new Set(nodes.map((n) => n.id));
    return allDrafts.filter((d) => known.has(d.focalId));
  }, [allDrafts, nodes]);

  // Slice 3 — the enhance stage's focal item + optimistic projection, lifted
  // above the create early-return so `discoveryFor` is a STABLE memoized
  // callback (the picker memoizes discovery per socket-open on its identity).
  const enhanceItem = useMemo(
    () => (enhanceFocalId ? buildStudioItem(enhanceFocalId, nodes, edges) : null),
    [enhanceFocalId, nodes, edges],
  );
  const enhanceProjection = useMemo(() => {
    if (!enhanceItem) return null;
    return projectBearings(
      {
        isA: enhanceItem.bearings.up.neighbors,
        dependsOn: enhanceItem.bearings.right.neighbors,
        contains: enhanceItem.bearings.down.neighbors,
        relates: enhanceItem.bearings.left.neighbors,
      },
      changes,
    );
  }, [enhanceItem, changes]);

  // Slice 6 — 지도 엣지 딥링크. `?edit=<relation>:<targetId>` arrives when a map
  // edge's "공방에서 이 관계 고치기" is clicked. Resolve the target satellite on the
  // focal's BASE bearings (not the projection — a deep-link opens on saved data)
  // so the stage can open THAT relation's edit card with the satellite highlighted.
  const editRequest = useMemo(
    () => parseOntologyStudioEditParam(searchParams.get("edit")),
    [searchParams],
  );
  const editTarget = useMemo(() => {
    if (!editRequest || !enhanceItem) return null;
    const group = enhanceItem.bearings[BEARING_OF[editRequest.relation]];
    const neighbor = group.neighbors.find((n) => n.id === editRequest.targetId);
    return neighbor ? { relation: editRequest.relation, neighbor } : null;
  }, [editRequest, enhanceItem]);
  // Stale deep-link (edge no longer on the focal) → one quiet honest toast, then
  // just show the node. Guarded to fire once per (focal, edit) so re-renders and
  // data loads don't re-toast. Only fires once graph data is present (enhanceItem
  // resolved) so a mid-load miss isn't mistaken for a stale link.
  const staleEditToastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editRequest || !enhanceItem || editTarget) return;
    const key = `${enhanceFocalId ?? ""}|${searchParams.get("edit") ?? ""}`;
    if (staleEditToastRef.current === key) return;
    staleEditToastRef.current = key;
    toast.show(t("staleEditLink"), "info");
  }, [editRequest, enhanceItem, editTarget, enhanceFocalId, searchParams, toast, t]);
  // The picker's discovery surface (추천 + 둘러보기) for a socket's relation —
  // excludes self + already-connected + staged targets. Read-only, deterministic.
  const discoveryFor = useCallback(
    (relation: StudioRelation) =>
      buildPickerDiscovery({
        focalId: enhanceItem?.node.id ?? "",
        nodes,
        edges,
        relation,
        allowedKinds: allowedKindsFor(relation, enhanceItem?.node.kind ?? null),
        stagedTargetIds: enhanceProjection?.pendingTargetIds,
      }),
    [enhanceItem, nodes, edges, enhanceProjection],
  );

  // C12③ — record BOTH locales' display names only when a secondary is supplied
  // (a half-filled pair leaves other-locale viewers seeing the raw title, so we
  // pair the current-locale title with the secondary name or write neither).
  const localeLabels = useMemo(
    () =>
      secondaryName.trim()
        ? { [locale]: title.trim(), [secondaryLocale]: secondaryName.trim() }
        : undefined,
    [secondaryName, locale, secondaryLocale, title],
  );
  const draft: CreateDraft = useMemo(
    () => ({ kind, title, domainValue, definition, relations, localeLabels }),
    [kind, title, domainValue, definition, relations, localeLabels],
  );

  const createSlugCollisionCandidate = useMemo(
    () => findCreateSlugCollision({ kind, title }, candidates),
    [kind, title, candidates],
  );
  const createSlugCollision = createSlugCollisionCandidate !== null;
  const createSimilarHit = useMemo(() => {
    if (!title.trim()) return null;
    if (createSlugCollisionCandidate) {
      return {
        slug: createSlugCollisionCandidate.ref,
        title: createSlugCollisionCandidate.title,
        kind: createSlugCollisionCandidate.kind,
      };
    }
    if (similarDismissed) return null;
    return findSimilarNodeByTitle(title, kind, similarCandidates);
  }, [title, kind, similarCandidates, similarDismissed, createSlugCollisionCandidate]);

  const openSimilarNode = useCallback(
    (slug: string) => {
      const node = candidates.find((c) => c.ref === slug);
      if (node) openNode(node.id);
    },
    [candidates, openNode],
  );

  const applyCreate = useCallback(async () => {
    if (!title.trim() || createSlugCollision) return;
    const newRef = buildCreateNodeSlug({ kind, title: title.trim() });
    const originTarget = createContext?.originWriteTarget ?? null;
    // A 에게 자기 문서가 없으면 A→새 노드 관계를 적을 자리도 없다. 동의를 먼저
    // 받고, 거절하면 아무것도 만들지 않는다 (새 노드까지 포함해서 — 관계 없이
    // 노드만 남기면 사용자가 시작한 문장이 반토막으로 디스크에 앉는다).
    let originKindChoice: CreateNodeKind | null = null;
    if (originTarget?.status === "missing" && newRef) {
      originKindChoice = await askDocConsent(originTarget);
      if (!originKindChoice) return;
    }
    if (writable) {
      try {
        const { slug, markdown } = buildCreateNodeDoc(draft);
        // C2 — create the node, then record A --relation--> new on A's own
        // frontmatter. Batched: the node write skips refresh so the origin
        // update triggers the single reload (both self-marked, one paint).
        const recordOrigin = Boolean(createContext && newRef);
        await localVault.createDoc(slug, markdown, { skipRefresh: recordOrigin });
        if (createContext && newRef && originTarget?.status === "missing" && originKindChoice) {
          // A 도 같은 저장에서 실체화된다 — 관계를 실은 채 한 번에 만든다.
          const originDocPlan = buildCreateNodeDoc(
            buildMaterializeDraft(originTarget, originKindChoice, [
              {
                relation: createContext.relation,
                candidate: { id: "", title: title.trim(), kind, ref: newRef },
              },
            ]),
            { slug: originTarget.slug },
          );
          await localVault.createDoc(originTarget.slug, originDocPlan.markdown);
        } else if (createContext && newRef && originTarget?.status === "existing") {
          const key = BEARING_FRONTMATTER_KEY[createContext.relation];
          const originDoc = localVault.manifest?.docs.find((d) => d.slug === originTarget.slug);
          const existing = originDoc ? asStringArray(originDoc.frontmatter[key]) : [];
          await localVault.updateFrontmatter(originTarget.slug, {
            [key]: Array.from(new Set([...existing, newRef])),
          });
        }
        // 실습이면 방금 디스크에 앉은 것들의 **되돌리기 표**를 여기서 만든다.
        // 나중에 재구성하려 하면 이미 상태가 흘러가 버려서(초안 리셋 · 이동)
        // "무엇을 지우는지" 를 정확히 말할 수 없다.
        if (isPractice) {
          onPracticeSaved({
            outcome: "written",
            slug,
            title: title.trim(),
            createdOriginSlug:
              createContext && newRef && originTarget?.status === "missing" && originKindChoice
                ? originTarget.slug
                : null,
            touchedOrigin:
              createContext && newRef && originTarget?.status === "existing"
                ? {
                    slug: originTarget.slug,
                    frontmatterKey: BEARING_FRONTMATTER_KEY[createContext.relation],
                    ref: newRef,
                  }
                : null,
          });
        }
        // 만든 뒤에는 보관본을 비운다 — 안 비우면 다음 방문에 **이미 만든
        // 노드**가 미완성 초안인 척 되살아난다.
        clearCreateDraft();
        // 실습에서는 토스트를 내지 않는다 — 마무리 대화상자가 **같은 사실을
        // 파일명까지 붙여** 이미 말한다. 같은 초에 성공 신호 둘은 중복 잉크이고,
        // 절정의 주목을 나눠 갖는다(카운슬 「모션」).
        if (!isPractice) {
          toast.show(t("create.appliedDirect", { title: title.trim() }), "success");
        }
        // 새로 만든 문서의 노드 id 도 실체화와 같은 함수로 정한다 — 두 경로가
        // 각자 계산하면 project 처럼 id 규칙이 다른 종류에서 갈라진다.
        openNode(resolveMaterializedNodeId(slug, kind, nodes));
      } catch (err) {
        toast.show(t("create.applyFailed", { message: err instanceof Error ? err.message : String(err) }), "error");
      }
      return;
    }
    try {
      // C2 — read-only: ONE packet with add_concept + the A→new origin relation.
      let origin: CreateOrigin | undefined;
      // A 에게 문서가 없으면 A 를 가리키는 add_relation 은 에이전트 쪽에서
      // 실패한다. 그래서 A 도 관계를 실은 add_concept 한 줄로 함께 만든다.
      let originConceptLine: string | null = null;
      if (createContext && originTarget?.status === "missing" && originKindChoice && newRef) {
        originConceptLine = buildMcpPacket(
          buildMaterializeDraft(originTarget, originKindChoice, [
            {
              relation: createContext.relation,
              candidate: { id: "", title: title.trim(), kind, ref: newRef },
            },
          ]),
          undefined,
          { slug: originTarget.slug },
        );
      } else if (createContext && originTarget?.status === "existing") {
        const broaderRefsAfter =
          createContext.relation === "isA"
            ? [
                ...(buildStudioItem(createContext.originId, nodes, edges)?.bearings.up.neighbors.map(
                  (n) => n.ref,
                ) ?? []),
                ...(newRef ? [newRef] : []),
              ]
            : undefined;
        origin = {
          // 복사되는 명령이라 에이전트 볼트 뿌리 기준 이름을 쓴다.
          focalSlug: originTarget.agentSlug,
          relation: createContext.relation,
          broaderRefsAfter,
        };
      }
      const packet = [buildMcpPacket(draft, origin), originConceptLine]
        .filter((line): line is string => Boolean(line))
        .join("\n");
      await navigator.clipboard.writeText(packet);
      toast.show(t("create.copiedAgent"), "success");
      clearCreateDraft();
      // **읽기 전용에서도 실습은 끝난다.** 초안에서 이 갈래를 빼먹어, 볼트를
      // 아직 안 고른 사람(웹 관문의 첫 방문자 — 정확히 이 실습의 대상)은
      // 안내 띠가 "저장하면 폴더 안에 마크다운 파일 하나가 생깁니다" 에
      // 영구히 멈췄다. 그 문장은 그 사람에게 **거짓**이었고, 마무리 대화상자는
      // 오지 않았다. 디자인 카운슬 두 자리가 서로 못 본 채 같은 결함을
      // 1순위로 짚었다(2026-07-29).
      if (isPractice) {
        onPracticeSaved({
          outcome: "copied",
          slug: buildCreateNodeSlug({ kind, title: title.trim() }) ?? title.trim(),
          title: title.trim(),
          createdOriginSlug: null,
          touchedOrigin: null,
        });
      }
    } catch {
      toast.show(t("create.copyFailed"), "info");
    }
  }, [title, createSlugCollision, writable, draft, localVault, toast, t, kind, openNode, createContext, nodes, edges, askDocConsent, isPractice, onPracticeSaved]);



  // ② 2026-07-28 — 폭 강등. 이 화면은 데스크톱 레일 전용으로 설계됐는데
  // (`BottomTabBar` 가 공방 탭을 뺀 이유, #707) 라우트에는 가드가 없어서
  // 딥링크 세 갈래가 <lg 로 그대로 떨어졌다. 여기서 한 번 정직하게 말한다.
  // 모든 훅 뒤·모든 분기 앞이라 어떤 진입(create/enhance/딥링크)이든 같은 답을
  // 받는다 — 조건을 갈래마다 두면 하나가 빠져도 아무도 모른다(#65 계열 drift).
  // 안내 문장은 **지금 초안의 실제 상태**에서 나온다 — 카운터가 아니다.
  // 그래서 사용자가 순서를 어겨도(관계 먼저, 이름 나중) 안내가 따라간다.
  const practiceRailStep = practiceStep({
    title,
    relationCount: relations.length,
    saved: practiceSaved,
  });

  if (narrowViewport) return <StudioTooNarrow />;

  if (isCreate) {
    const bearings: CompassBearingView[] = RELATIONS.map((relation) => {
      const rels = relations.filter((r) => r.type === relation);
      const neighbors = rels.map((r) => ({
        id: r.candidate.id,
        title: r.candidate.title,
        kind: r.candidate.kind,
        ref: r.candidate.ref,
      }));
      const filled = neighbors.length > 0;
      return {
        bearing: BEARING_OF[relation],
        relation,
        question: questionFor(relation),
        laneLabel: laneLabelFor(relation),
        emptyHint: emptyHintFor(relation),
        neighbors,
        filled,
        // Every create-mode relation is unsaved until 저장 — flow its strut.
        staged: filled,
        recommended: !filled && relation === "isA",
        expected: !filled && relation === "contains",
      };
    });
    const filledBearings = bearings.filter((b) => b.filled).length;
    const excludeFor = (relation: StudioRelation) =>
      new Set(relations.filter((r) => r.type === relation).map((r) => r.candidate.id));

    const createChanges: StudioChange[] = relations.map((r) => ({
      op: "add",
      relation: r.type,
      target: { id: r.candidate.id, title: r.candidate.title, kind: r.candidate.kind, ref: r.candidate.ref },
    }));
    const domainLabelText = domains.find((d) => d.value === domainValue)?.title ?? null;
    // C2 — the origin (A --relation--> new) surfaces as a quiet context line and
    // as the first line of the staged record summary.
    const originSummary = createContext
      ? { focalName: createContext.originLabel, bearingLabel: relationShort(createContext.relation) }
      : undefined;
    const createOriginNote = createContext
      ? t("create.originNote", {
          name: createContext.originLabel,
          bearing: relationShort(createContext.relation),
        })
      : null;
    const createSummary = summarizeStudioChanges(
      {
        mode: "create",
        kindLabel: kindLabel(kind),
        name: title.trim() || t("create.namePlaceholder"),
        domainLabel: domainLabelText,
        changes: createChanges,
        origin: originSummary,
      },
      summaryVocab,
    );
    // C2 — when opened from a socket, restrict the kind chooser to the bearing's
    // allowed target kinds (isA/dependsOn/… × A's kind); fall back to all kinds
    // if the window is empty so the chooser is never dead.
    const allowedCreateKinds = createContext
      ? CREATE_KINDS.filter((k) =>
          allowedKindsFor(createContext.relation, createContext.originKind).has(k),
        )
      : CREATE_KINDS;
    const createKindOptions = (allowedCreateKinds.length > 0 ? allowedCreateKinds : CREATE_KINDS).map(
      (k) => ({ value: k, label: kindLabel(k) }),
    );
    // Slice 5 — the save-preview mini-graph for a brand-new node: the center is
    // itself the delta (isNew), every staged relation an indigo "added" strut.
    const createDeltaPreview = buildDeltaPreview({
      center: {
        title: title.trim() || t("create.namePlaceholder"),
        kind,
        domainLabel: domainLabelText,
        isNew: true,
      },
      baseNeighborsByRelation: { isA: [], dependsOn: [], contains: [], relates: [] },
      changes: createChanges,
      capPerBearing: 2,
    });

    return (
      <>
      <StudioCompass
        mode="create"
        initialFocus="create-name"
        labels={labels}
        kindLabelFor={kindLabel}
        focal={{
          kindLabel: kindLabel(kind),
          domainLabel: domainLabelText,
          name: title,
          definition,
        }}
        bearings={bearings}
        filledBearings={filledBearings}
        writable={writable}
        candidatesFor={(relation, query) => makeCandidatesFor(relation, kind, query, excludeFor(relation))}
        similarFor={(relation, query) => makeSimilarFor(relation, kind, query, excludeFor(relation))}
        onFill={(relation, candidate) =>
          setRelations((prev) =>
            prev.some((r) => r.type === relation && r.candidate.id === candidate.id)
              ? prev
              : [...prev, { type: relation, candidate }],
          )
        }
        onSave={applyCreate}
        onExit={exit}
        banner={
          isPractice && !practiceSaved ? (
            <StudioPracticeRail
              step={practiceRailStep}
              labels={{
                // 읽기 전용에서는 "저장하면 파일이 생깁니다" 가 **거짓**이다.
                // 그 사람에게 저장은 파일이 아니라 명령을 만든다.
                instruction:
                  practiceRailStep === "save" && !writable
                    ? t("practice.step.saveCopy")
                    : t(`practice.step.${practiceRailStep}`),
                progress: t("practice.progress", {
                  current: practiceStepIndex(practiceRailStep),
                  total: 4,
                }),
                quit: t("practice.quit"),
                progressAria: t("practice.progressAria"),
              }}
              onQuit={() =>
                navigateStudio(new URLSearchParams({ mode: "create" }), { drop: ["practice"] })
              }
            />
          ) : null
        }
        agentDockOpen={agentDock?.open}
        onToggleAgentDock={agentDock?.toggle}
        searchNodes={candidates}
        onOpenNode={openNode}
        moreRelationsSoon={t("moreRelationsSoon")}
        canSave={Boolean(title.trim()) && !createSlugCollision}
        summary={title.trim() ? createSummary : null}
        deltaPreview={title.trim() ? createDeltaPreview : null}
        onUndoChange={(index) => setRelations((prev) => prev.filter((_, i) => i !== index))}
        hasPendingChanges={Boolean(title.trim()) || relations.length > 0}
        bearingLabelFor={relationShort}
        editabilityOf={() => true}
        onRemove={(relation, neighbor) =>
          setRelations((prev) => prev.filter((r) => !(r.type === relation && r.candidate.id === neighbor.id)))
        }
        onRetype={(from, to, neighbor) =>
          setRelations((prev) =>
            prev.map((r) => (r.type === from && r.candidate.id === neighbor.id ? { ...r, type: to } : r)),
          )
        }
        createOriginNote={createOriginNote}
        createKinds={createKindOptions}
        createKind={kind}
        onCreateKind={(k) => {
          setKind(k);
          if (!kindExpectsDomain(k)) setDomainValue(null);
          setSimilarDismissed(false);
        }}
        onCreateName={(n) => {
          setTitle(n);
          setSimilarDismissed(false);
        }}
        createDomains={kindExpectsDomain(kind) ? domains : []}
        createDomainValue={domainValue}
        onCreateDomain={setDomainValue}
        onCreateDefinition={setDefinition}
        createSecondaryName={secondaryName}
        onCreateSecondaryName={setSecondaryName}
        createSecondaryNamePlaceholder={t("create.secondaryName")}
        createSimilarHit={createSimilarHit}
        createSlugCollision={createSlugCollision}
        onOpenSimilar={openSimilarNode}
        onDismissSimilar={() => setSimilarDismissed(true)}
      />
      {docConsent ? (
        <StudioMaterializeDialog
          target={docConsent.target}
          labels={materializeLabels(docConsent.target.title)}
          onConfirm={(chosen) => docConsent.settle(chosen)}
          onCancel={() => docConsent.settle(null)}
        />
      ) : null}
      </>
    );
  }

  // ─────────────────────────────── ENTRY CHOICE (#1) ─────────────────────
  // Bare open with a non-empty vault → let the user pick intent first instead
  // of silently dropping into enhance. Deep-links skip this; an empty vault
  // falls through to the enhance empty-state (which already offers create).
  if (!hasStudioDeepLink && !choiceDismissed && nodes.length > 0) {
    return (
      <StudioEntryChoice
        labels={{
          title: t("entryChoice.title"),
          enhanceTitle: t("entryChoice.enhanceTitle"),
          enhanceDesc: t("entryChoice.enhanceDesc"),
          enhanceRecommend: enhanceItem
            ? t("entryChoice.enhanceRecommend", { name: enhanceItem.node.label })
            : null,
          createTitle: t("entryChoice.createTitle"),
          createDesc: t("entryChoice.createDesc"),
          practice: t("entryChoice.practice"),
          exit: t("entryChoice.exit"),
          dialogAria: t("entryChoice.dialogAria"),
        }}
        onEnhance={() => {
          setStageInitialFocus("heading");
          setChoiceDismissed(true);
        }}
        onCreate={enterCreate}
        onPractice={enterPractice}
        onExit={exit}
      />
    );
  }

  // ─────────────────────────────── ENHANCE ───────────────────────────────
  // 방금 만든 문서를 여는 중 — 진행을 흉내내지 않는다(막대·스피너 0). 무슨
  // 일이 일어나는지 한 문장으로 말하고, 대개 한 프레임 뒤 무대가 대신 그려진다.
  if (openingMaterialized) {
    return (
      <main
        id="main"
        className="flex h-[100dvh] items-center justify-center bg-[color:var(--color-canvas)] p-6"
      >
        <p
          data-testid="studio-materialize-opening"
          className="text-body text-[color:var(--color-text-tertiary)]"
        >
          {t("materialize.opening")}
        </p>
        </main>
    );
  }
  // 요청한 개념이 없으면 다른 개념을 대신 열지 않는다 — 죽은 딥링크는
  // 프로젝트 상세와 같은 문법으로 정직하게 말하고 갈 곳을 준다.
  if (requestedNodeMissing) {
    return (
      <main
        id="main"
        className="flex h-[100dvh] items-center justify-center bg-[color:var(--color-canvas)] p-6"
      >
        <EmptyState
          // 읽는 길이를 한 줄로 늘어놓지 않는다 — 카드가 화면 폭을 다 먹으면
          // 한 문장이 1000px 을 넘어가 읽기가 끊긴다(같은 표면의 짧은 빈 상태
          // 는 문장이 짧아 드러나지 않던 문제).
          className="w-full max-w-lg"
          title={t("notFound.title")}
          description={t("notFound.body", { name: requestedNode?.trim() ?? "" })}
          tone="solid"
          align="center"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={exit}
                className="rounded-lg border border-[color:var(--color-border-strong)] px-3 py-1.5 text-label font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {t("notFound.openMap")}
              </button>
              <button
                type="button"
                onClick={enterCreate}
                className="rounded-lg border border-[color:var(--color-border-strong)] px-3 py-1.5 text-label font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
              >
                {t("notFound.create")}
              </button>
            </div>
          }
        />
      </main>
    );
  }
  if (!enhanceItem || !enhanceProjection) {
    return (
      <main
        id="main"
        className="flex h-[100dvh] items-center justify-center bg-[color:var(--color-canvas)] p-6"
      >
        <EmptyState
          title={t("empty.title")}
          description={t("empty.body")}
          tone="solid"
          align="center"
          action={
            <button
              type="button"
              onClick={enterCreate}
              className="rounded-lg border border-[color:var(--color-border-strong)] px-3 py-1.5 text-label font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {t("empty.create")}
            </button>
          }
        />
      </main>
    );
  }

  const focalItem = enhanceItem;
  const writeTarget = focalItem.node.writeTarget;
  // 자기 문서가 없는 개념은 **기준 frontmatter 자체가 없다.** 예전엔 남의 문서를
  // 여기에 넣어서, 그 문서의 관계 배열이 이 개념의 것인 양 읽히고(지지대 편집이
  // 열리고) 저장까지 그 문서로 갔다.
  const focalDoc =
    writable && localVault.manifest && writeTarget.status === "existing"
      ? localVault.manifest.docs.find((d) => d.slug === writeTarget.slug)
      : undefined;

  // Optimistic projection of the pending changes (computed above). The stage
  // renders the PROJECTION so struts/satellites move before the disk write; the
  // summary + commit consume the same `changes`.
  const projection = enhanceProjection;

  // Guide the next empty socket in the same priority buildStudioItem uses.
  const GUIDE_ORDER: StudioRelation[] = ["isA", "contains", "dependsOn", "relates"];
  const recommendedRel = GUIDE_ORDER.find((r) => !projection.byRelation[r].filled) ?? null;

  const bearings: CompassBearingView[] = RELATIONS.map((relation) => {
    const proj = projection.byRelation[relation];
    return {
      bearing: BEARING_OF[relation],
      relation,
      question: questionFor(relation),
      laneLabel: laneLabelFor(relation),
      emptyHint: emptyHintFor(relation),
      neighbors: proj.neighbors,
      filled: proj.filled,
      // A lane with a not-yet-saved neighbor flows its strut (저장 대기 = alive).
      staged: proj.neighbors.some((n) => projection.pendingTargetIds?.has(n.id)),
      recommended: !proj.filled && relation === recommendedRel,
      expected: !proj.filled && relation === "contains",
    };
  });
  const filledBearings = RELATIONS.filter((r) => projection.byRelation[r].filled).length;

  // Exclude self + everything currently (projected) on a lane from its picker.
  const excludeFor = (relation: StudioRelation) =>
    new Set<string>([focalItem.node.id, ...projection.byRelation[relation].neighbors.map((n) => n.id)]);

  // Base frontmatter refs per relation — the source of truth for the writable
  // commit AND direction detection (is this edge editable from the focal doc?).
  const baseRefs: Record<StudioRelation, string[]> = {
    isA: focalDoc ? asStringArray(focalDoc.frontmatter.broader) : [],
    dependsOn: focalDoc ? asStringArray(focalDoc.frontmatter.dependencies) : [],
    contains: focalDoc ? asStringArray(focalDoc.frontmatter.contains) : [],
    relates: focalDoc ? asStringArray(focalDoc.frontmatter.relates) : [],
  };

  // 스테이징 = 즉시 임시저장. 확인을 묻지 않고 붙잡아 두는 것이 이 표면의 계약이다
  // (#60 — 소유자: "입력하면 자동저장시키면 안되나? 임시저장 형태로?").
  const stage = (action: Parameters<typeof reduceStudioChanges>[1]) =>
    setChanges((prev) => {
      const next = reduceStudioChanges(prev, action);
      saveStudioDraft(focalItem.node.id, focalItem.node.label, next);
      return next;
    });

  const summary =
    changes.length > 0
      ? summarizeStudioChanges({ mode: "enhance", focalName: focalItem.node.label, changes }, summaryVocab)
      : null;

  // Slice 5 — the save-preview mini-graph. Existing neighborhood (achromatic
  // context) + only the staged delta in indigo. Same `changes` as the summary so
  // the picture and the sentences never disagree. `hasDelta` gates the affordance.
  const deltaPreview = buildDeltaPreview({
    center: {
      title: focalItem.node.label,
      kind: focalItem.node.kind,
      domainLabel: focalItem.node.domainLabel,
      isNew: false,
    },
    baseNeighborsByRelation: {
      isA: focalItem.bearings.up.neighbors,
      dependsOn: focalItem.bearings.right.neighbors,
      contains: focalItem.bearings.down.neighbors,
      relates: focalItem.bearings.left.neighbors,
    },
    changes,
    capPerBearing: 2,
  });

  // Returns true when the staged changes were persisted (writable) / copied
  // (read-only) — the walk guard's "저장하고 이동" only navigates on a real success.
  const commit = async (): Promise<boolean> => {
    if (changes.length === 0) {
      toast.show(t("nothingToCommit"), "info");
      return false;
    }
    // 파일 조작의 결정은 순수 함수 하나가 한다 — 여기서는 그 결정을 실행만
    // 한다. 문서 없는 개념이면 동의를 먼저 묻고, 거절하면 아무 파일도 건드리지
    // 않은 채 변경은 초안으로 남는다.
    let plan = planStudioCommit({ writeTarget, changes, baseRefs });
    if (plan.op === "consent-required") {
      const chosenKind = await askDocConsent(plan.target);
      if (!chosenKind) return false;
      plan = planStudioCommit({ writeTarget, changes, baseRefs, approvedKind: chosenKind });
    }
    if (plan.op === "nothing") return false;
    if (plan.op === "create-document") {
      const { slug, draft: materialized, addedCount } = plan;
      if (writable) {
        try {
          const { markdown } = buildCreateNodeDoc(materialized, { slug });
          // 실체화하면 이 개념의 id 가 별칭에서 문서 기준으로 바뀐다 — 주소에
          // 옛 별칭을 남기면 성공한 저장이 "찾을 수 없음" 으로 보인다.
          const nextFocalId = resolveMaterializedNodeId(slug, materialized.kind, nodes);
          setMaterializing({ slug, kind: materialized.kind });
          await localVault.createDoc(slug, markdown);
          toast.show(t("materialize.saved", { name: materialized.title, count: addedCount }), "success");
          clearStudioDraft(focalItem.node.id);
          setChanges([]);
          openNode(nextFocalId);
          return true;
        } catch (err) {
          setMaterializing(null);
          toast.show(t("commitFailed", { message: err instanceof Error ? err.message : String(err) }), "error");
          return false;
        }
      }
      try {
        await navigator.clipboard.writeText(buildMcpPacket(materialized, undefined, { slug }));
        toast.show(t("commitCopied"), "success");
        clearStudioDraft(focalItem.node.id);
        setChanges([]);
        return true;
      } catch {
        toast.show(t("fillCopyFailed"), "info");
        return false;
      }
    }
    // 동의를 물었는데도 여전히 동의 대기면 저장하지 않는다 (도달 불가 경로의 안전망).
    if (plan.op !== "update-frontmatter") return false;
    const sourceSlug = plan.slug;
    if (writable) {
      try {
        await localVault.updateFrontmatter(sourceSlug, plan.updates);
        toast.show(t("commitSaved", { count: changes.length }), "success");
        // 디스크에 실제로 앉은 뒤에만 초안을 비운다 — 실패하면 초안이 그대로 남아야
        // 사용자가 재시도할 수 있다.
        clearStudioDraft(focalItem.node.id);
        setChanges([]);
        return true;
      } catch (err) {
        toast.show(t("commitFailed", { message: err instanceof Error ? err.message : String(err) }), "error");
        return false;
      }
    }
    // read-only → one copyable MCP packet. The `broader` array is idempotent, so
    // any is_a-touching line writes the SAME final array (dupes are harmless).
    // 패킷의 이름은 디스크 경로가 아니라 **에이전트가 아는 이름** 이다 —
    // 번들 샘플은 매니페스트 경로 앞에 조각이 하나 더 붙어 있어 그대로
    // 넘기면 붙여넣는 즉시 실패한다.
    const packetSlug = plan.agentSlug;
    try {
      const broaderAfter = projection.byRelation.isA.neighbors.map((n) => n.ref);
      const lines = changes.map((c) => {
        if (c.op === "add") {
          return c.relation === "isA"
            ? buildRemovePacket(packetSlug, "isA", c.target.ref, { broaderRefsAfter: broaderAfter })
            : buildFillPacket(packetSlug, c.relation, c.target.ref);
        }
        if (c.op === "remove") {
          return buildRemovePacket(packetSlug, c.relation, c.target.ref, { broaderRefsAfter: broaderAfter });
        }
        return buildEditPacket(packetSlug, c.from, c.to, c.target.ref, { broaderRefsAfter: broaderAfter });
      });
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.show(t("commitCopied"), "success");
      clearStudioDraft(focalItem.node.id);
      setChanges([]);
      return true;
    } catch {
      toast.show(t("fillCopyFailed"), "info");
      return false;
    }
  };

  // Save-then-walk for the pending-changes guard's "저장하고 이동" option. Only
  // re-centers when the commit actually succeeded (else the changes stay staged).
  const commitThenOpen = async (id: string) => {
    if (await commit()) openNode(id);
  };

  // "← <이전 노드>" back affordance + arrival highlight need the came-from node's
  // display label. Both are dropped when the came-from node is the current focal
  // (self) or no longer in the graph.
  const cameFromNode = cameFrom && cameFrom !== focalItem.node.id ? nodes.find((n) => n.id === cameFrom) : undefined;
  const backTo = cameFromNode ? { id: cameFromNode.id, label: cameFromNode.display ?? cameFromNode.title } : null;

  return (
    <>
    <StudioCompass
      key={focalItem.node.id}
      mode="enhance"
      initialFocus={stageInitialFocus ?? undefined}
      onInitialFocusApplied={clearStageInitialFocus}
      labels={labels}
      kindLabelFor={kindLabel}
      focal={{
        kindLabel: kindLabel(focalItem.node.kind),
        domainLabel: focalItem.node.domainLabel,
        name: focalItem.node.label,
        definition: focalItem.node.definition,
      }}
      bearings={bearings}
      filledBearings={filledBearings}
      writable={writable}
      candidatesFor={(relation, query) =>
        makeCandidatesFor(relation, focalItem.node.kind, query, excludeFor(relation))
      }
      similarFor={(relation, query) =>
        makeSimilarFor(relation, focalItem.node.kind, query, excludeFor(relation))
      }
      discoveryFor={discoveryFor}
      onFill={(relation, candidate) =>
        stage({
          type: "add",
          relation,
          target: { id: candidate.id, title: candidate.title, kind: candidate.kind, ref: candidate.ref },
        })
      }
      onRetype={(from, to, neighbor) => stage({ type: "retype", from, to, target: neighbor })}
      onRemove={(relation, neighbor) => stage({ type: "remove", relation, target: neighbor })}
      editabilityOf={(relation, neighbor) =>
        writable ? isRelationEditableFromFocal(focalDoc?.frontmatter, relation, neighbor) : true
      }
      initialEdit={editTarget}
      bearingLabelFor={relationShort}
      pendingNeighborIds={projection.pendingTargetIds}
      summary={summary}
      deltaPreview={deltaPreview}
      onUndoChange={(index) => stage({ type: "undo", index })}
      hasPendingChanges={changes.length > 0}
      focalId={focalItem.node.id}
      drafts={visibleDrafts}
      onOpenDraft={openNode}
      onDiscardDraft={(id) => {
        clearStudioDraft(id);
        if (id === focalItem.node.id) setChanges([]);
      }}
      canSave={changes.length > 0}
      onSave={commit}
      onExit={exit}
      agentDockOpen={agentDock?.open}
      onToggleAgentDock={agentDock?.toggle}
      onCreateNew={(ctx) => {
        // C2 — carry the socket's relation + typed query into CREATE so the new
        // node lands with the A --relation--> new link + a name prefill.
        if (!ctx) {
          enterCreate();
          return;
        }
        const params = new URLSearchParams({
          mode: "create",
          from: focalItem.node.id,
          rel: ctx.relation,
        });
        if (ctx.query.trim()) params.set("name", ctx.query.trim());
        navigateStudio(params);
      }}
      searchNodes={candidates}
      onOpenNode={openNode}
      onSaveAndOpenNode={commitThenOpen}
      // Slice 6 — a deep-link arrival highlights its edit target satellite (reuses
      // the Slice 4 arrival ring); otherwise the walked-from node keeps the ring.
      arrivedFrom={editTarget?.neighbor.id ?? backTo?.id ?? null}
      backTo={backTo}
      moreRelationsSoon={t("moreRelationsSoon")}
    />
    {docConsent ? (
      <StudioMaterializeDialog
        target={docConsent.target}
        labels={materializeLabels(docConsent.target.title)}
        onConfirm={(chosen) => docConsent.settle(chosen)}
        onCancel={() => docConsent.settle(null)}
      />
    ) : null}
    </>
  );
}

/**
 * `/ontology/studio` 의 바깥 껍질 — **실습 마무리의 유일한 자리.**
 *
 * 왜 껍질이 필요한가: 무대(`StudioStage`)는 진입 선택 · 폭 강등 · 실체화 대기 ·
 * 죽은 딥링크 · 빈 볼트 · 생성 · 강화로 **여덟 갈래의 이른 return** 을 가진다.
 * 실습 저장은 `openNode` 로 이동을 일으키므로 착지 분기가 그때그때 다르고,
 * 마무리 대화상자를 분기마다 심으면 **하나가 빠져도 아무도 모른다** — 실제로
 * 처음 구현에서 빈 볼트 분기가 빠져 저장 직후 「지울까요?」가 증발했다.
 *
 * 그래서 조건부 렌더 위가 아니라 **밖**에 둔다. 분기 수가 몇이든 이 자리는 하나다.
 */
export function OntologyStudioPage() {
  const t = useTranslations("ontologyStudio");
  const toast = useToast();
  const localVault = useLocalVault();
  const navigateStudio = useStudioNavigate();
  const [practiceArtifact, setPracticeArtifact] = useState<PracticeArtifact | null>(null);
  const [practiceBusy, setPracticeBusy] = useState(false);
  /**
   * 마무리를 **저장이 서명을 마친 뒤에** 묻는다.
   *
   * 프레임 실측(카운슬 「모션」, 2026-07-29): 저장 클릭 67ms 뒤에 네 가지가
   * 동시에 떨어졌다 — 무대 재중심(1프레임 하드컷) · 띠 언마운트 · 마무리
   * 스크림 · 다이얼로그 스프링. 결과물(완성된 노드가 무대에 선 상태)은 **가시
   * 0프레임**이었고, 확정 서명(수렴 칩 240ms)은 재생 40% 지점에서 **산 채로
   * 묻혔다.**
   *
   * 사용자가 부른 것은 "썼다" 인데 모션 예산 전부를 **다른 질문**("지울까요?")
   * 이 가져간 셈이다. 헌장의 판정식① 그대로다.
   *
   * 그래서 한 박자 늦춘다 — 이건 인과 스태거라 헌장이 허용한다(원인: 저장이
   * 끝났다 → 결과: 정리를 묻는다). **기다림을 강요하지는 않는다**: 그 사이
   * 아무 입력이나 오면 즉시 띄운다.
   */
  /**
   * 마무리를 **저장이 서명을 마친 뒤에** 묻는다.
   *
   * 프레임 실측(카운슬 「모션」, 2026-07-29): 저장 클릭 67ms 뒤에 네 가지가
   * 동시에 떨어졌다 — 무대 재중심(1프레임 하드컷) · 띠 언마운트 · 마무리
   * 스크림 · 다이얼로그 스프링. 결과물(완성된 노드가 무대에 선 상태)은 **가시
   * 0프레임**이었고, 확정 서명(수렴 칩 240ms)은 재생 40% 지점에서 **묻혔다.**
   * 사용자가 부른 것은 "썼다" 인데 모션 예산 전부를 **다른 질문**이 가져간 셈
   * 이다 — 헌장 판정식① 그대로다.
   *
   * 한 박자 늦추는 것은 인과 스태거라 헌장이 허용한다(원인: 저장이 끝났다 →
   * 결과: 정리를 묻는다). **기다림을 강요하지는 않는다** — 그 사이 아무 입력이나
   * 오면 즉시 띄운다.
   *
   * 타이머를 이펙트가 아니라 **아티팩트를 세우는 쪽**에서 건다. 이펙트 본문에서
   * 곧바로 setState 하면 연쇄 렌더가 되고, 그건 이 저장소 lint 가 이미 잡는
   * 실수다.
   */
  const [cleanupReady, setCleanupReady] = useState(false);
  const signatureTimerRef = useRef<number | null>(null);
  const recordPracticeArtifact = useCallback((artifact: PracticeArtifact) => {
    setCleanupReady(false);
    setPracticeArtifact(artifact);
    const reveal = () => {
      if (signatureTimerRef.current !== null) {
        window.clearTimeout(signatureTimerRef.current);
        signatureTimerRef.current = null;
      }
      window.removeEventListener("keydown", reveal);
      window.removeEventListener("pointerdown", reveal);
      setCleanupReady(true);
    };
    signatureTimerRef.current = window.setTimeout(reveal, PRACTICE_SIGNATURE_MS);
    window.addEventListener("keydown", reveal);
    window.addEventListener("pointerdown", reveal);
  }, []);

  // ── 오른쪽 에이전트 도크 ──────────────────────────────────────────────
  const locale = useLocale();
  const { insight } = useOntologyInsight();
  const dockDefaultOpen = useAgentDockDefaultOpen();
  const dockTooNarrow = useViewportBelow(STUDIO_AGENT_DOCK_MIN_VIEWPORT_PX);
  // 다리가 없으면(웹) 도크 자체를 안 그린다 — 원리적으로 불가한 능력에
  // 잠긴 표면을 상주시키지 않는다(`surfaces.md`).
  const dockUsable = isLlmChatBridgeAvailable() && !dockTooNarrow;
  const [dockOpenState, setDockOpenState] = useState(false);
  const dockTouchedRef = useRef(false);
  useEffect(() => {
    if (dockDefaultOpen !== true || dockTouchedRef.current) return;
    setDockOpenState(true);
  }, [dockDefaultOpen]);
  const dockOpen = dockUsable && dockOpenState;
  const closeDock = useCallback(() => {
    dockTouchedRef.current = true;
    setDockOpenState(false);
  }, []);
  /**
   * 무대 헤더의 문. **닫은 뒤 다시 열 수 있어야** 도크가 함정이 아니다 —
   * 이 문이 없던 동안 공방에서 한 번 닫으면 그 세션에서 되돌릴 방법이 없었다
   * (2026-07-29 설치 앱 실측).
   */
  const toggleDock = useCallback(() => {
    dockTouchedRef.current = true;
    setDockOpenState((open) => !open);
  }, []);

  const vaultPath = localVault.handle ? getTauriVaultRootPath(localVault.handle) ?? null : null;
  /**
   * 공방이 에이전트에게 건네는 화면 맥락 — **지금 무대 위의 개념**이 전부다.
   * 지도의 스냅샷과 필드는 같고 값의 출처만 다르다(렌즈·가시 노드 수는 공방에
   * 없는 개념이라 비운다). 없는 사실을 지어내지 않는 것이 이 스냅샷의 계약이다.
   */
  const focalNode = useMemo(() => {
    const id = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    ).get("node");
    return id ? insight?.nodes.find((n) => n.id === id) ?? null : null;
  }, [insight]);
  const screenContext = useMemo<ScreenContextSnapshot>(
    () => ({
      focusedSlug: focalNode?.agentSlug ?? null,
      focusedTitle: focalNode?.title ?? null,
      focusedKind: focalNode?.kind ?? null,
      lenses: [],
      projectTitle: null,
      visibleNodeCount: insight?.nodes.length ?? 0,
    }),
    [focalNode, insight],
  );

  /**
   * 실습 정리 — **진짜 삭제**다. 새 노드를 지우고, 이 실습이 함께 실체화한
   * 출발 문서가 있으면 그것도 지우고, 원래 있던 출발 문서에 덧붙인 참조는
   * 그 문서를 남긴 채 그것만 뗀다. 새 노드만 지우면 출발 노드에 깨진 참조가
   * 남아 실습이 볼트를 더럽히고 끝난다.
   */
  const runPracticeCleanup = useCallback(async () => {
    if (!practiceArtifact) return;
    const plan = planPracticeCleanup(practiceArtifact);
    setPracticeBusy(true);
    try {
      if (plan.detach) {
        const doc = localVault.manifest?.docs.find((d) => d.slug === plan.detach!.slug);
        const existing = doc ? asStringArray(doc.frontmatter[plan.detach.frontmatterKey]) : [];
        const next = existing.filter((ref) => ref !== plan.detach!.ref);
        await localVault.updateFrontmatter(plan.detach.slug, {
          // 마지막 참조였으면 키 자체를 없앤다 — 빈 배열이 남으면 "관계를
          // 지웠는데 흔적이 남았다" 로 읽힌다.
          [plan.detach.frontmatterKey]: next.length > 0 ? next : null,
        });
      }
      for (const slug of plan.deleteSlugs) {
        await localVault.deleteDoc(slug);
      }
      setPracticeArtifact(null);
      toast.show(t("practice.removed", { name: practiceArtifact.title }), "success");
      // 실습이 끝났으니 실습 표시도 주소에서 뺀다 — 안 빼면 다음 저장이 또
      // 실습으로 읽힌다.
      navigateStudio(new URLSearchParams({ mode: "create" }), { drop: ["practice"] });
    } catch (err) {
      toast.show(
        t("practice.removeFailed", { message: err instanceof Error ? err.message : String(err) }),
        "error",
      );
    } finally {
      setPracticeBusy(false);
    }
  }, [practiceArtifact, localVault, toast, t, navigateStudio]);

  /**
   * 남겨 두기 — 연습이 곧 볼트의 첫 노드가 된다. 아무것도 되돌리지 않고
   * 실습 표시만 뗀다(안 떼면 다음 저장이 또 실습으로 읽힌다).
   */
  const keepPractice = useCallback(() => {
    setPracticeArtifact(null);
    navigateStudio(new URLSearchParams(window.location.search), { drop: ["practice"] });
  }, [navigateStudio]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <div className="relative min-w-0 flex-1">
        <StudioStage
          practiceSaved={practiceArtifact !== null}
          onPracticeSaved={recordPracticeArtifact}
          agentDock={dockUsable ? { open: dockOpen, toggle: toggleDock } : null}
        />
      </div>
      {/* 오른쪽 에이전트 도크 — 지도와 **같은 위젯, 같은 자리**. 공방에서만
          폭 조건이 하나 더 붙는 이유는 `lib/studio-agent-dock.ts` 에 있다:
          도크가 가져가는 폭이 무대를 자기 최소 폭 아래로 누르면, 폭 강등은
          뷰포트만 보므로 발화하지 않은 채 깨진 기하로 들어간다. */}
      {dockUsable ? (
        <VaultAgentPanel
          open={dockOpen}
          onClose={closeDock}
          vaultPath={vaultPath}
          insight={insight}
          manifest={localVault.manifest}
          screenContext={screenContext}
          vaultIsGit={false}
          canWrite={localVault.status === "loaded" && Boolean(localVault.handle)}
          // 공방에는 지도가 없다 — 개념 칩을 누르면 **그 개념의 무대**로 간다.
          // 같은 화면 안에서 답하는 것이 다른 표면으로 튕기는 것보다 낫다.
          onFocusNode={(slug) => navigateStudio(new URLSearchParams({ node: slug }))}
          downloadHref={`/${locale}/download/`}
        />
      ) : null}
      {practiceArtifact && cleanupReady ? (
        <StudioPracticeCleanup
          outcome={practiceArtifact.outcome}
          plan={planPracticeCleanup(practiceArtifact)}
          busy={practiceBusy}
          labels={{
            // 넘기기만 한 실습은 **다른 사실**을 말해야 한다 — 파일이 안 생겼고
            // 지울 것도 없다. 같은 문장을 쓰면 화면이 없는 파일을 약속한다.
            title:
              practiceArtifact.outcome === "written"
                ? t("practice.cleanupTitle")
                : t("practice.copiedTitle"),
            summary:
              practiceArtifact.outcome === "written"
                ? t("practice.cleanupSummary", { name: practiceArtifact.title })
                : t("practice.copiedSummary", { name: practiceArtifact.title }),
            question:
              practiceArtifact.outcome === "written"
                ? t("practice.cleanupQuestion")
                : t("practice.copiedQuestion"),
            deleteLabel: t("practice.delete"),
            keepLabel:
              practiceArtifact.outcome === "written"
                ? t("practice.keep")
                : t("practice.copiedDone"),
            detachNote: t("practice.detachNote"),
            agentHint: t("practice.agentHint"),
            agentAction: t("practice.agentAction"),
            dialogAria: t("practice.cleanupTitle"),
          }}
          onDelete={() => void runPracticeCleanup()}
          onKeep={keepPractice}
          // **먼저 닫고 나서 연다.** 설정 시트는 z-40 인데 이 마무리 백드롭은
          // z-[60] 이고 Tab 트랩이 capture 단계라, 그냥 열면 시트가 이 모달
          // **뒤에서** 열리고 포커스도 계속 회수된다 — 이 버튼이 그려지는
          // 유일한 자리에서 문이 잠긴 셈이었다(카운슬 「핸드오프」 실측).
          // 모달 위 모달은 modality 계약 위반이니 순차가 답이다.
          onAgentAction={() => {
            keepPractice();
            requestSettingsView("ai");
          }}
        />
      ) : null}
    </div>
  );
}
