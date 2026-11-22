/**
 * The choices of the tool picker: the current agent expands into its models when it has any, every
 * other agent is one choice. With no agent list, the current agent alone.
 */
export function toolPickerOptions({
  runtimes,
  runtimeId,
  runtimeLabel,
  models,
}: {
  runtimes: ReadonlyArray<{ id: string; label: string }>;
  runtimeId: string;
  runtimeLabel: string;
  models: ReadonlyArray<{ id: string; name: string }>;
}): Array<{ value: string; label: string }> {
  return (runtimes.length > 0 ? runtimes : [{ id: runtimeId, label: runtimeLabel }]).flatMap((r) =>
    r.id === runtimeId && models.length > 0
      ? models.map((model) => ({ value: `model:${model.id}`, label: `${r.label} · ${model.name}` }))
      : [{ value: `runtime:${r.id}`, label: r.label }],
  );
}

/** The picker's selected value: the current model when the agent lists models, otherwise the agent. */
export function toolPickerValueOf({
  runtimeId,
  models,
  currentModelId,
}: {
  runtimeId: string;
  models: ReadonlyArray<{ id: string }>;
  currentModelId: string | null | undefined;
}): string {
  return models.length > 0 ? (currentModelId ? `model:${currentModelId}` : '') : `runtime:${runtimeId}`;
}
