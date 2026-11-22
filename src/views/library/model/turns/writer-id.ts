/** The `created_by` value a page written by the connected coding agent carries. */
export function agentWriterId(runtime: { id: string } | null | undefined): string {
  return `agent:${runtime?.id ?? "unknown"}`;
}

/** The `created_by` value for a compile: the local model's name, or the connected agent. */
export function compileWriterId(
  route: "local" | "agent" | string,
  localModel: { model: string } | null | undefined,
  runtime: { id: string } | null | undefined,
): string {
  return route === "local" ? `model:${localModel?.model ?? "unknown"}` : agentWriterId(runtime);
}
