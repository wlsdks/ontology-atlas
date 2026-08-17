"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  serializeProcessPacket,
  verifyProcessPacket,
  type SkillProcessDerivation,
  type SkillProcessSemanticLabel,
} from "@/entities/agent-skill";
import { Button } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";

import { StepText } from "./StepText";

const testIdPart = (value: string): string => value.replace(/^[^:]+:/, "").replace(/[^a-zA-Z0-9_-]/g, "-");

/**
 * 지문을 **알아볼 만큼만** 남긴다 — `sha256:` 접두는 떼고 앞 6자.
 *
 * 이 값이 화면에서 하는 일은 「원문이 그대로인가」를 눈으로 대조하는 것 하나다.
 * 전체 71자를 펴 두면 그 일은 조금도 쉬워지지 않으면서 머리글의 남는 폭을 전부
 * 먹는다. 전체 값은 `title` 로 남아 있어 대조할 사람은 그대로 손에 넣는다.
 */
const shortDigest = (value: string): string => value.replace(/^sha256:/, "").slice(0, 6);

export function SkillProcessRail({
  process,
  openStepIds,
  onToggleStep,
}: {
  process: SkillProcessDerivation;
  openStepIds: ReadonlySet<string>;
  onToggleStep: (stepId: string) => void;
}) {
  const t = useTranslations("agentSkills.process");
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const packet = useMemo(() => serializeProcessPacket(process), [process]);
  const verifiedPacket = useMemo(
    () => packet.state === "ready" ? verifyProcessPacket(packet.bytes) : packet,
    [packet],
  );
  const packetReady = packet.state === "ready" && verifiedPacket.state === "ready";

  const copyPacket = async () => {
    if (!packetReady || packet.state !== "ready") return;
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(packet.text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  if (process.state === "unavailable") {
    return (
      <section
        data-testid="skill-process-rail"
        data-process-state="unavailable"
        className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-3"
      >
        <h3 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h3>
        <p className="mt-1 text-body leading-prose text-[color:var(--color-danger-text)]">
          {t("unavailable")}
        </p>
        <DiagnosticList diagnostics={process.diagnostics} t={t} />
        <PacketAction
          ready={false}
          state="unavailable"
          copyState={copyState}
          onCopy={copyPacket}
          t={t}
        />
      </section>
    );
  }

  const { process: ir } = process;
  const skillDir = ir.source.path.replace(/\/SKILL\.md$/, "");
  return (
    <section data-testid="skill-process-rail" data-process-state="ready">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t("title")}
          </h3>
          <p className="mt-0.5 text-body text-[color:var(--color-text-tertiary)]">
            {t("exactCount", { count: ir.steps.length })}
          </p>
        </div>
        {/* **71자 해시를 통째로 펴 두면 머리글이 그것으로 채워진다** — 원문이
            안 바뀌었는지 대조할 때 쓰는 값이라 화면에 필요한 것은 «있다»와
            «앞 몇 자»뿐이고, 대조할 사람은 전체 값을 손에 넣을 수 있어야 한다.
            그래서 앞 6자만 그리고 전체는 title 로 남긴다. */}
        <span
          title={ir.source.digest}
          className="shrink-0 font-mono text-label text-[color:var(--color-text-quaternary)]"
        >
          {t("digestLabel")} {shortDigest(ir.source.digest)}
        </span>
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {ir.steps.map((step) => {
          const resources = ir.resources.filter((resource) =>
            resource.referencedByStepIds.includes(step.stepId),
          );
          const diagnostics = ir.diagnostics.filter((diagnostic) =>
            diagnostic.sourceSpan?.start.line === step.sourceSpan.start.line,
          );
          const hasDetail = resources.length + diagnostics.length > 0;
          const open = openStepIds.has(step.stepId);
          const detailId = `skill-step-detail-${testIdPart(step.stepId)}`;
          return (
            <li
              key={step.stepId}
              data-testid="skill-process-step"
              data-step-id={step.stepId}
              data-ordinal={step.ordinal}
              data-source-start={step.sourceSpan.start.line}
              data-source-end={step.sourceSpan.end.line}
              className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5">
                <span className="font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">
                  {step.ordinal}
                </span>
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap break-words text-body-lg leading-prose text-[color:var(--color-text-primary)]">
                    <StepText text={step.exactText} />
                  </p>
                  {step.semanticLabels.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {step.semanticLabels.map((label) => (
                        <li
                          key={`${label.kind}:${label.sourceSpan.start.line}`}
                          data-testid="skill-semantic-label"
                          data-semantic-kind={label.kind}
                          className="text-body leading-prose text-[color:var(--color-text-tertiary)]"
                        >
                          {semanticLabelText(label, t)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                  {/* 시작과 끝이 같은 줄이면 「L38–L38」이 아니라 「L38」이다 —
                      제목으로 적은 절차가 들어오면서 이 모양이 단계의 절반을
                      넘게 됐다(2026-08-18). 범위가 아닌 것을 범위로 쓰면 읽는
                      사람이 두 수를 대조하게 만든다. */}
                  {step.sourceSpan.start.line === step.sourceSpan.end.line
                    ? t("linesOne", { line: step.sourceSpan.start.line })
                    : t("lines", {
                        start: step.sourceSpan.start.line,
                        end: step.sourceSpan.end.line,
                      })}
                </span>
              </div>
              {hasDetail ? (
                <>
                  <button
                    type="button"
                    data-testid="skill-step-disclosure"
                    aria-expanded={open}
                    aria-controls={detailId}
                    onClick={() => onToggleStep(step.stepId)}
                    className={controlClass({ shape: "link", size: "sm", tone: "muted", className: "mt-2" })}
                  >
                    {open ? t("hideDetail") : t("showDetail")}
                  </button>
                  <div
                    id={detailId}
                    className={open ? "mt-2 border-t border-[color:var(--color-border-soft)] pt-2" : ""}
                  >
                    {open ? (
                      <>
                      {resources.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {resources.map((resource) => (
                            <li key={resource.path} className="text-body text-[color:var(--color-text-secondary)]">
                              {/* 앞자리(`<스킬>/`)는 바로 위 제목이 이미 말했다 —
                                  3단 사슬이 같은 이유로 이미 떼고 있었는데 여기만
                                  전체 경로였다. 그리고 종류는 영어 enum 이 아니라
                                  뜻으로 적는다(`script` → 「돌아가는 것」). */}
                              {shortenResource(resource.path, skillDir)} ·{" "}
                              {t(resourceKindKey(resource.kind))} · {resource.exists === true
                                ? t("resourceExists")
                                : resource.exists === false
                                  ? t("resourceMissing")
                                  : t("resourceUnknown")}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <DiagnosticList diagnostics={diagnostics} t={t} />
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      {ir.diagnostics.filter((diagnostic) => !diagnostic.sourceSpan).length > 0 ? (
        <DiagnosticList diagnostics={ir.diagnostics.filter((diagnostic) => !diagnostic.sourceSpan)} t={t} />
      ) : null}
      <PacketAction
        ready={packetReady}
        state={verifiedPacket.state}
        digest={packet.state === "ready" ? packet.packetDigest : null}
        copyState={copyState}
        onCopy={copyPacket}
        t={t}
      />
    </section>
  );
}

function semanticLabelText(
  label: SkillProcessSemanticLabel,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (label.kind) {
    case "branch":
      return t("semanticBranch", { guard: label.guard, target: label.targetOrdinal });
    case "retry":
      return t("semanticRetry", { target: label.targetOrdinal, condition: label.condition });
    case "stop":
      return t("semanticStop", { condition: label.condition });
    case "verify":
      return t("semanticVerify", {
        target: label.target,
        action: label.action,
        criterion: label.criterion,
      });
  }
}

function PacketAction({
  ready,
  state,
  digest = null,
  copyState,
  onCopy,
  t,
}: {
  ready: boolean;
  state: string;
  digest?: string | null;
  copyState: "idle" | "copying" | "copied" | "failed";
  onCopy: () => Promise<void>;
  t: ReturnType<typeof useTranslations>;
}) {
  const status = !ready
    ? state === "tampered" ? t("packetTampered") : t("packetUnavailable")
    : copyState === "copied" ? t("packetCopied")
      : copyState === "failed" ? t("packetCopyFailed")
        : copyState === "copying" ? t("packetCopying")
          : t("packetAvailable");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-border-soft)] pt-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="skill-packet-copy"
        disabled={!ready || copyState === "copying"}
        onClick={() => void onCopy()}
      >
        {t("packetCopy")}
      </Button>
      <p data-testid="skill-packet-status" aria-live="polite" className="text-body text-[color:var(--color-text-tertiary)]">
        {status}
      </p>
      {digest ? (
        <span
          title={digest}
          className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]"
        >
          {shortDigest(digest)}
        </span>
      ) : null}
    </div>
  );
}

function DiagnosticList({
  diagnostics,
  t,
}: {
  diagnostics: readonly { code: string; message: string }[];
  t: ReturnType<typeof useTranslations>;
}) {
  if (diagnostics.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.code}:${index}`} className="text-body leading-prose text-[color:var(--color-danger-text)]">
          {diagnosticText(diagnostic, t)}
        </li>
      ))}
    </ul>
  );
}

function diagnosticText(
  diagnostic: { code: string; message: string },
  t: ReturnType<typeof useTranslations>,
): string {
  switch (diagnostic.code) {
    case "scan_truncated": return t("diagnosticScanTruncated");
    case "skill_markdown_unsupported": return t("diagnosticMarkdownUnsupported");
    case "numbered_steps_unavailable": return t("diagnosticStepsUnavailable");
    case "resource_missing": return t("diagnosticResourceMissing");
    case "resource_existence_unverified": return t("diagnosticResourceUnchecked");
    case "resource_path_unsupported": return t("diagnosticResourcePathUnsupported");
    case "semantic_ambiguous": return t("diagnosticSemanticAmbiguous");
    default: return diagnostic.message;
  }
}

/** 자료 종류를 **뜻으로** 옮기는 문구 열쇠. 영어 enum 을 화면에 그대로 두지 않는다. */
function resourceKindKey(kind: string): string {
  switch (kind) {
    case "script":
      return "resourceKindScript";
    case "asset":
      return "resourceKindAsset";
    case "template":
      return "resourceKindTemplate";
    case "example":
      return "resourceKindExample";
    default:
      return "resourceKindReference";
  }
}

/** 스킬 폴더 앞자리를 뗀다 — 3단 사슬이 쓰는 규칙과 같다. */
function shortenResource(path: string, skillDir: string): string {
  return skillDir && path.startsWith(`${skillDir}/`) ? path.slice(skillDir.length + 1) : path;
}
