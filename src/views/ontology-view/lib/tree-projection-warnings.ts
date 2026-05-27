export type TreeProjectionWarningKind =
  | "multiple-parent"
  | "cycle"
  | "self-parent"
  | "duplicate"
  | "other";

export interface TreeProjectionWarningGroup {
  kind: TreeProjectionWarningKind;
  count: number;
  examples: string[];
}

export interface TreeProjectionWarningSummary {
  total: number;
  groups: TreeProjectionWarningGroup[];
}

const ORDER: TreeProjectionWarningKind[] = [
  "multiple-parent",
  "cycle",
  "self-parent",
  "duplicate",
  "other",
];

export function classifyTreeProjectionWarning(
  warning: string,
): TreeProjectionWarningKind {
  if (warning.includes("multiple parents")) return "multiple-parent";
  if (warning.includes("cycle detected")) return "cycle";
  if (warning.includes("self-parent")) return "self-parent";
  if (warning.includes("reached twice")) return "duplicate";
  return "other";
}

export function summarizeTreeProjectionWarnings(
  warnings: readonly string[],
  exampleLimit = 2,
): TreeProjectionWarningSummary {
  const groups = new Map<TreeProjectionWarningKind, TreeProjectionWarningGroup>();

  for (const warning of warnings) {
    const kind = classifyTreeProjectionWarning(warning);
    const group =
      groups.get(kind) ??
      ({
        kind,
        count: 0,
        examples: [],
      } satisfies TreeProjectionWarningGroup);
    group.count += 1;
    if (group.examples.length < exampleLimit) {
      group.examples.push(extractWarningSubject(warning));
    }
    groups.set(kind, group);
  }

  return {
    total: warnings.length,
    groups: ORDER.map((kind) => groups.get(kind)).filter(
      (group): group is TreeProjectionWarningGroup => Boolean(group),
    ),
  };
}

function extractWarningSubject(warning: string): string {
  const quoted = warning.match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];
  const paren = warning.match(/\(([^)]+)\)/);
  return paren?.[1] ?? warning;
}
