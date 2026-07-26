export type AgentPackageDistributionStatus = "unpublished" | "published";

export interface AgentPackageDistribution {
  status: AgentPackageDistributionStatus;
  checkedAt: string;
  evidence: "npm-registry-e404" | "npm-registry-published";
  cliPackage: "ontology-atlas";
  mcpPackage: "ontology-atlas-mcp";
}

/**
 * Public install availability is a product gate, not an inference from local
 * package.json files. The monorepo packages can build and pack successfully
 * while the public registry still has no installable artifact.
 *
 * Flip this only after the publish checklist proves both public registry
 * entries and the fresh-shell `npx` smoke. Until then every installed-app
 * setup surface must fail closed and point contributors to the source-checkout
 * path instead of writing a configuration that cannot boot.
 */
export const AGENT_PACKAGE_DISTRIBUTION: AgentPackageDistribution = {
  status: "unpublished",
  checkedAt: "2026-07-27",
  evidence: "npm-registry-e404",
  cliPackage: "ontology-atlas",
  mcpPackage: "ontology-atlas-mcp",
};

export const PUBLIC_AGENT_PACKAGES_READY =
  AGENT_PACKAGE_DISTRIBUTION.status === "published";
