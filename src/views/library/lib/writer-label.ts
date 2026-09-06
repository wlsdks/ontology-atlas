/**
 * The `created_by` and `status` values a wiki page carries are contract vocabulary
 * (`agent:claude`, `model:llama3.1`, `human`; `draft`, `reviewed`). On the surface they are
 * words a person reads, so the identifier form stays in the file and a readable form goes on
 * the row: the runtime's name, the model's name, or "a person". An unknown value is shown as
 * written rather than guessed at.
 */
export type LibraryLabelT = (key: string, values?: Record<string, string | number>) => string;

const RUNTIME_NAMES: Record<string, string> = { claude: "Claude", codex: "Codex", gemini: "Gemini" };

export function writerLabel(createdBy: string | null | undefined, t: LibraryLabelT): string {
  if (!createdBy) return t("wiki.unknownAuthor");
  if (createdBy === "human") return t("wiki.writer.human");
  const agent = /^agent:(.+)$/.exec(createdBy);
  if (agent) return t("wiki.writer.agent", { name: RUNTIME_NAMES[agent[1]] ?? agent[1] });
  const model = /^model:(.+)$/.exec(createdBy);
  if (model) return t("wiki.writer.model", { name: model[1] });
  return createdBy;
}

export function wikiStatusLabel(status: string | null | undefined, t: LibraryLabelT): string | null {
  if (!status) return null;
  if (status === "draft" || status === "reviewed") return t(`wiki.status.${status}`);
  return status;
}
