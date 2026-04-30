import { appendAccountQuery } from "@/shared/lib/account-scope";
import {
  getDemoContainerStats,
  getDemoDataset,
  getDemoWorkspaceProjects,
} from "@/shared/mocks/demo-data";

export const DEMO_ACCOUNT_ID = "stress-lab";
const DEMO_PROJECT_SLUG = "narnia-indexer-10";

export function getDemoProjectsHref() {
  return appendAccountQuery("/projects", DEMO_ACCOUNT_ID);
}

export function getDemoHomeHref() {
  return appendAccountQuery("/", DEMO_ACCOUNT_ID);
}

export function getDemoProjectHref() {
  return `/project/${DEMO_PROJECT_SLUG}/`;
}

export interface DemoStats {
  workspaceName: string;
  totalProjects: number;
  totalContainers: number;
  totalHubs: number;
  totalNodes: number;
}

let demoStatsCache: DemoStats | null = null;

export function getDemoStats(): DemoStats {
  if (demoStatsCache) return demoStatsCache;
  const dataset = getDemoDataset();
  const containers = getDemoWorkspaceProjects(DEMO_ACCOUNT_ID);
  const stats = getDemoContainerStats(DEMO_ACCOUNT_ID);
  let totalHubs = 0;
  let totalNodes = 0;
  for (const stat of stats.values()) {
    totalHubs += stat.hubs;
    totalNodes += stat.nodes;
  }
  demoStatsCache = {
    workspaceName: dataset.account.name,
    totalProjects: dataset.projects.length,
    totalContainers: containers.length,
    totalHubs,
    totalNodes,
  };
  return demoStatsCache;
}
