import type {
  SkillProcessDiagnostic,
  SkillProcessSemanticLabel,
  SkillProcessStep,
} from "../model/types";

export interface SkillProcessSemanticOverlay {
  readonly labels: readonly SkillProcessSemanticLabel[];
  readonly diagnostics: readonly SkillProcessDiagnostic[];
}

function literal(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

const SEMANTIC_CUE =
  /\b(if|go to step|retry|stop|verify|accept when|rollback|deadline|checksum|mismatch|otherwise)\b/i;

function ambiguous(step: SkillProcessStep, sourceDigest: string): SkillProcessSemanticOverlay {
  return {
    labels: [],
    diagnostics: [
      {
        code: "semantic_ambiguous",
        severity: "warning",
        message: "Semantic syntax is ambiguous; no label was derived.",
        sourceSpan: step.sourceSpan,
        sourceDigest,
      },
    ],
  };
}

/**
 * K1.2 is a label overlay, not a workflow engine. Only whole-step grammar is
 * admitted and this function cannot create a transition edge.
 */
export function deriveStepSemanticOverlay(
  step: SkillProcessStep,
  sourceDigest: string,
  knownOrdinals: ReadonlySet<number>,
): SkillProcessSemanticOverlay {
  const branch = step.exactText.match(/^If ([^\r\n]+), go to step ([1-9]\d*)\.$/);
  if (branch && literal(branch[1])) {
    const targetOrdinal = Number(branch[2]);
    if (knownOrdinals.has(targetOrdinal)) {
      return {
        labels: [
          {
            kind: "branch",
            guard: branch[1],
            targetOrdinal,
            sourceSpan: step.sourceSpan,
            sourceDigest,
          },
        ],
        diagnostics: [],
      };
    }
  }
  const retry = step.exactText.match(/^Retry step ([1-9]\d*) until ([^\r\n]+)\.$/);
  if (retry && literal(retry[2])) {
    const targetOrdinal = Number(retry[1]);
    if (knownOrdinals.has(targetOrdinal)) {
      return {
        labels: [
          {
            kind: "retry",
            targetOrdinal,
            condition: retry[2],
            sourceSpan: step.sourceSpan,
            sourceDigest,
          },
        ],
        diagnostics: [],
      };
    }
  }
  const stop = step.exactText.match(/^Stop the process if ([^\r\n]+)\.$/);
  if (stop && literal(stop[1])) {
    return {
      labels: [
        {
          kind: "stop",
          condition: stop[1],
          sourceSpan: step.sourceSpan,
          sourceDigest,
        },
      ],
      diagnostics: [],
    };
  }
  const verify = step.exactText.match(
    /^Verify ([^\r\n]+) by ([^\r\n]+); accept when ([^\r\n]+)\.$/,
  );
  if (verify && literal(verify[1]) && literal(verify[2]) && literal(verify[3])) {
    return {
      labels: [
        {
          kind: "verify",
          target: verify[1],
          action: verify[2],
          criterion: verify[3],
          sourceSpan: step.sourceSpan,
          sourceDigest,
        },
      ],
      diagnostics: [],
    };
  }
  return SEMANTIC_CUE.test(step.exactText)
    ? ambiguous(step, sourceDigest)
    : { labels: [], diagnostics: [] };
}
