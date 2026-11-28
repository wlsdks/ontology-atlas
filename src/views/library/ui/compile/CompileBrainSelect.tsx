import type { useTranslations } from "use-intl";

import { Select } from "@/shared/ui";

import type { CompileBrain } from "../../lib/compile/compile-brain";
import type { LibraryLocalModel } from "../../lib/agent/use-library-agent";

/**
 * Which brain Compile runs on, when this computer offers two. It stands in both places Compile starts
 * from and reads and writes the same stored answer, so the shelf and the sidebar never name different
 * brains. With one brain there is nothing to choose, so the static line stays; options use the shelf's words.
 */
export function CompileBrainSelect({
  brain,
  agentLabel,
  localModel,
  onChoose,
  size = "md",
  className,
  t,
}: {
  brain: CompileBrain | null;
  /** The verified coding agent's own name, as the shelf prints it. */
  agentLabel: string | null;
  localModel: LibraryLocalModel | null;
  onChoose: (brain: CompileBrain) => void;
  size?: "md" | "lg";
  className?: string;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  if (!localModel) return null;
  return (
    <Select
      data-testid="library-compile-brain"
      size={size}
      className={className}
      ariaLabel={t("stage.compile.brainLabel")}
      value={brain ?? "agent"}
      onChange={(next) => onChoose(next === "local" ? "local" : "agent")}
      options={[
        { value: "agent", label: t("stage.brainAgent", { name: agentLabel ?? "" }) },
        {
          value: "local",
          label: t("stage.brainLocal", { model: localModel.model, host: localModel.host }),
        },
      ]}
    />
  );
}
