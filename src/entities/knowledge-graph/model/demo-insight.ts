import {
  DEMO_ACCOUNT_ID,
  getDemoKnowledgeDocumentsByProject,
  getDemoProject,
} from "@/shared/mocks/demo-data";
import { CONTAINER_THEMES } from "@/shared/mocks/demo-blueprint";
import type { KnowledgeGraphEdge, KnowledgeGraphNode, KnowledgeProjectInsight } from "./types";

const DEMO_PUBLISHED_AT = new Date("2026-04-20T09:00:00Z");

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function demoNode(
  input: Omit<KnowledgeGraphNode, "accountId" | "lastApprovedAt" | "lastApprovedBy" | "publishedAt" | "publishId" | "projectionVersion">,
): KnowledgeGraphNode {
  return {
    ...input,
    accountId: DEMO_ACCOUNT_ID,
    lastApprovedAt: DEMO_PUBLISHED_AT,
    lastApprovedBy: "demo-publisher",
    publishedAt: DEMO_PUBLISHED_AT,
    publishId: "demo-public-projection",
    projectionVersion: "demo-v1",
  };
}

function demoEdge(
  input: Omit<KnowledgeGraphEdge, "accountId" | "lastApprovedAt" | "lastApprovedBy" | "publishedAt" | "publishId" | "projectionVersion">,
): KnowledgeGraphEdge {
  return {
    ...input,
    accountId: DEMO_ACCOUNT_ID,
    lastApprovedAt: DEMO_PUBLISHED_AT,
    lastApprovedBy: "demo-publisher",
    publishedAt: DEMO_PUBLISHED_AT,
    publishId: "demo-public-projection",
    projectionVersion: "demo-v1",
  };
}

export function getDemoKnowledgeProjectInsight(
  projectId: string,
  _accountId?: string | null,
): KnowledgeProjectInsight {
  // /ontology 페이지의 글로벌 view — 모든 도메인의 capability/element 를
  // ontology 노드로 합쳐서 트리·ego graph 가 풍부하게 보이게.
  if (projectId === "__all__") {
    return getDemoGlobalOntology();
  }

  const project = getDemoProject(projectId);
  const documents = getDemoKnowledgeDocumentsByProject(projectId);
  if (!project || documents.length === 0) {
    return { nodes: [], edges: [], meta: null };
  }

  const publicDocuments = documents
    .filter((document) => document.status === "published")
    .concat(documents.filter((document) => document.status !== "published"))
    .slice(0, 3);
  const conceptTitles = Array.from(
    new Set([
      ...project.tags.slice(0, 2),
      ...project.stack.slice(0, 2),
      project.isHub ? "허브 경계" : "서비스 역할",
      "운영 흐름",
    ]),
  ).slice(0, 4);

  const projectNode = demoNode({
    id: `demo:${project.slug}:project`,
    title: project.name,
    kind: "project",
    projectIds: [project.slug],
    summary: project.description,
    evidenceIds: publicDocuments.map((document) => document.id),
    evidenceCount: publicDocuments.length,
  });
  const documentNodes = publicDocuments.map((document) =>
    demoNode({
      id: `demo:${project.slug}:doc:${document.id}`,
      title: document.title,
      kind: "document",
      projectIds: [project.slug],
      summary: `${project.name}의 ${document.kind} 문서에서 공개 토폴로지 근거로 반영된 항목입니다.`,
      evidenceIds: [document.id],
      evidenceCount: 1,
      currentRevisionId: document.currentVersionId,
    }),
  );
  const conceptNodes = conceptTitles.map((title, index) =>
    demoNode({
      id: `demo:${project.slug}:concept:${slugPart(title) || index}`,
      title,
      kind: "concept",
      projectIds: [project.slug],
      summary: `${project.name} 문서에서 반복적으로 언급되는 핵심 맥락입니다.`,
      evidenceIds: publicDocuments.map((document) => document.id),
      evidenceCount: Math.max(1, publicDocuments.length - (index % 2)),
    }),
  );

  const documentEdges = documentNodes.map((documentNode) =>
    demoEdge({
      id: `demo:${project.slug}:edge:${documentNode.id}:project`,
      from: projectNode.id,
      to: documentNode.id,
      type: "describes",
      label: "describes",
      projectIds: [project.slug],
      evidenceIds: documentNode.evidenceIds,
      evidenceCount: documentNode.evidenceIds.length,
    }),
  );
  const conceptEdges = conceptNodes.flatMap((conceptNode, index) => {
    const documentNode = documentNodes[index % documentNodes.length];
    if (!documentNode) return [];
    return [
      demoEdge({
        id: `demo:${project.slug}:edge:${documentNode.id}:${conceptNode.id}`,
        from: documentNode.id,
        to: conceptNode.id,
        type: "mentions",
        label: "mentions",
        projectIds: [project.slug],
        evidenceIds: documentNode.evidenceIds,
        evidenceCount: conceptNode.evidenceCount,
      }),
    ];
  });

  return {
    nodes: [projectNode, ...documentNodes, ...conceptNodes],
    edges: [...documentEdges, ...conceptEdges],
    meta: {
      id: "current",
      currentPublishId: "demo-public-projection",
      projectionVersion: "demo-v1",
      publishedAt: DEMO_PUBLISHED_AT,
    },
  };
}

/**
 * 모든 컨테이너 도메인의 capability + element 를 ontology 노드로 펼쳐
 * `/ontology` 글로벌 트리에서 의미 있는 시각화. AI 추출 cloud path 가 비활성
 * 이라 demo 의 frontmatter 정의 (CONTAINER_THEMES) 가 곧 ontology 진실원.
 *
 * 출력 구조:
 *   각 컨테이너 = domain 노드 (kind: domain)
 *   각 capability = capability 노드, domain 의 자식 (contains)
 *   각 element = element 노드, domain 의 자식 (contains)
 */
function getDemoGlobalOntology(): KnowledgeProjectInsight {
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];

  for (const theme of CONTAINER_THEMES) {
    const domainId = `demo:${theme.id}:domain`;
    nodes.push(
      demoNode({
        id: domainId,
        title: theme.name,
        kind: "domain",
        projectIds: [theme.id],
        summary: theme.description,
        evidenceIds: [],
        evidenceCount: 0,
      }),
    );

    for (const capability of theme.capabilities) {
      const capId = `demo:${theme.id}:cap:${slugPart(capability)}`;
      nodes.push(
        demoNode({
          id: capId,
          title: capability,
          kind: "capability",
          projectIds: [theme.id],
          summary: `${theme.name} 도메인의 사용자 가치.`,
          evidenceIds: [],
          evidenceCount: 0,
        }),
      );
      edges.push(
        demoEdge({
          id: `demo:${theme.id}:edge:domain-cap:${slugPart(capability)}`,
          from: domainId,
          to: capId,
          type: "contains",
          label: "contains",
          projectIds: [theme.id],
          evidenceIds: [],
          evidenceCount: 0,
        }),
      );
    }

    for (const element of theme.elements) {
      const elemId = `demo:${theme.id}:el:${slugPart(element)}`;
      nodes.push(
        demoNode({
          id: elemId,
          title: element,
          kind: "element",
          projectIds: [theme.id],
          summary: `${theme.name} 가 사용하는 element.`,
          evidenceIds: [],
          evidenceCount: 0,
        }),
      );
      edges.push(
        demoEdge({
          id: `demo:${theme.id}:edge:domain-el:${slugPart(element)}`,
          from: domainId,
          to: elemId,
          type: "contains",
          label: "contains",
          projectIds: [theme.id],
          evidenceIds: [],
          evidenceCount: 0,
        }),
      );
    }
  }

  return {
    nodes,
    edges,
    meta: {
      id: "current",
      currentPublishId: "demo-public-projection",
      projectionVersion: "demo-v1",
      publishedAt: DEMO_PUBLISHED_AT,
    },
  };
}
