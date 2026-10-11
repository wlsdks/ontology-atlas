import { projectSourceRepairWitness, type ProjectSourceView, type ProjectSourceWitnessInput } from "@/shared/lib/project-source/project-source-receipt";

export function resolveProjectSourceRepair(input: {
  view: ProjectSourceView | null;
  projectSlug: string | null;
  graphHash: string | null;
  nodes: readonly { id: string; kind: string; title: string; agentSlug?: string | null; projectIds: readonly string[] }[];
  witnesses: readonly ProjectSourceWitnessInput[];
}) {
  const { view, projectSlug } = input;
  if (!view || view.projectSlug !== projectSlug || view.receipt?.graphHash !== input.graphHash) return null;
  const witness = projectSourceRepairWitness(view);
  if (!witness || !input.witnesses.some((current) => (
    current.nodeSlug === witness.nodeSlug && current.path === witness.path && current.role === witness.role
  ))) return null;
  const matches = input.nodes.filter((node) => (
    (node.agentSlug ?? node.id) === witness.nodeSlug
    && (node.projectIds.includes(projectSlug) || (node.kind === "project" && node.agentSlug === projectSlug))
  ));
  if (matches.length !== 1) return null;
  return { nodeId: matches[0].id, title: matches[0].title, nodeSlug: witness.nodeSlug, path: witness.path };
}
