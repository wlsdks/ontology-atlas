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

const testIdPart = (value: string): string => value.replace(/^[^:]+:/, "").replace(/[^a-zA-Z0-9_-]/g, "-");

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
        <span className="max-w-full break-all font-mono text-label text-[color:var(--color-text-quaternary)]">
          {ir.source.digest}
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
                    {step.exactText}
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
                  {t("lines", { start: step.sourceSpan.start.line, end: step.sourceSpan.end.line })}
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
                  {open ? (
                    <div id={detailId} className="mt-2 border-t border-[color:var(--color-border-soft)] pt-2">
                      {resources.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {resources.map((resource) => (
                            <li key={resource.path} className="text-body text-[color:var(--color-text-secondary)]">
                              {resource.path} · {resource.kind} · {resource.exists === true
                                ? t("resourceExists")
                                : resource.exists === false
                                  ? t("resourceMissing")
                                  : t("resourceUnknown")}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <DiagnosticList diagnostics={diagnostics} t={t} />
                    </div>
                  ) : null}
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
      {digest ? <span className="break-all font-mono text-caption text-[color:var(--color-text-quaternary)]">{digest}</span> : null}
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
