"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { buildDocsVaultHref, findRelatedDocs } from "@/entities/docs-vault";
import { useStaticVaultSource } from "@/entities/vault-session";
import { useDocumentDetails } from "@/features/document-detail";
import { useTaxonomy } from "@/features/taxonomy";
import {
  formatProjectIntegrityIssue,
  getProjectIntegrityIssues,
  getProjectRuntimeDetailHref,
  projectDisplayName,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  resolveProjectImpactInsight,
  type Project,
  type ProjectImpactMode,
} from "@/entities/project";
import {
  buildDependencyRelations,
  buildReferencedByRelations,
  displayNameWithoutContainer,
  findReferencedBy,
  pickNextProjects,
  relationshipSummaryMessage,
  type ProjectRelation,
  type RelationshipSummaryMessage,
} from "../lib/project-connections";

type IntegrityIssue = ReturnType<typeof getProjectIntegrityIssues>[number];

const RELATED_DOCS_LIMIT = 5;

export interface ProjectDrawerModel {
  isContainerNode: boolean;
  displayName: string;
  referencedBy: Project[];
  integrityIssueLabels: string[];
  missingDependencyIssues: Extract<IntegrityIssue, { code: "missing-dependency" }>[];
  completenessInsight: ReturnType<typeof resolveProjectCompletenessInsight> | null;
  freshnessInsight: ReturnType<typeof resolveProjectFreshnessInsight> | null;
  impactInsight: ReturnType<typeof resolveProjectImpactInsight> | null;
  dependencyRelations: ProjectRelation[];
  referencedByRelations: ProjectRelation[];
  relationshipSummary: RelationshipSummaryMessage | null;
  nextProjects: Project[];
  relatedDocs: ReturnType<typeof findRelatedDocs>;
  relatedDocDetails: ReturnType<typeof useDocumentDetails>;
  primaryRelatedDocSlug: string | null;
  detailHref: string;
  docsVaultHref: string;
}

/** Everything the drawer derives from the shown project and the whole project list. */
export function useProjectDrawerModel({
  project,
  allProjects,
  impactMode,
  containerLabel,
}: {
  project: Project | null;
  allProjects: Project[];
  impactMode: ProjectImpactMode;
  containerLabel?: string | null;
}): ProjectDrawerModel {
  const locale = useLocale();
  const { categories, statuses } = useTaxonomy();
  const isContainerNode = project?.category === "__container__";
  const displayName = project
    ? displayNameWithoutContainer(projectDisplayName(project, locale), containerLabel, isContainerNode)
    : "";

  const bySlug = useMemo(
    () => new Map(allProjects.map((candidate) => [candidate.slug, candidate])),
    [allProjects],
  );

  const referencedBy = useMemo(
    () => (project ? findReferencedBy(allProjects, project.slug) : []),
    [allProjects, project],
  );

  const integrityIssues = useMemo(
    () =>
      project
        ? getProjectIntegrityIssues(project, {
            allProjects,
            categoryIds: categories.map((category) => category.id),
            statusIds: statuses.map((status) => status.id),
          })
        : [],
    [allProjects, categories, project, statuses],
  );

  const integrityIssueLabels = useMemo(
    () => integrityIssues.map(formatProjectIntegrityIssue),
    [integrityIssues],
  );

  const missingDependencyIssues = useMemo(
    () =>
      integrityIssues.filter(
        (issue): issue is Extract<IntegrityIssue, { code: "missing-dependency" }> =>
          issue.code === "missing-dependency",
      ),
    [integrityIssues],
  );

  const completenessInsight = useMemo(
    () => (project ? resolveProjectCompletenessInsight(project) : null),
    [project],
  );
  const freshnessInsight = useMemo(
    () => (project ? resolveProjectFreshnessInsight(project) : null),
    [project],
  );
  const impactInsight = useMemo(
    () => (project ? resolveProjectImpactInsight(allProjects, project.slug, impactMode) : null),
    [allProjects, impactMode, project],
  );

  const dependencyRelations = project ? buildDependencyRelations(project, bySlug) : [];
  const referencedByRelations = project ? buildReferencedByRelations(project, referencedBy) : [];

  // Reads the chosen sample rather than the bundled manifest so it matches the rest of the screen.
  const { manifest: staticManifest } = useStaticVaultSource(undefined, { demand: Boolean(project) });
  const relatedDocs = useMemo(() => {
    if (!project) return [];
    return findRelatedDocs(
      staticManifest.docs,
      { projectSlug: project.slug, projectName: project.name },
      RELATED_DOCS_LIMIT,
    );
  }, [project, staticManifest]);
  const relatedDocRefs = useMemo(
    () => (relatedDocs.length > 0 ? relatedDocs.map((match) => match.doc) : null),
    [relatedDocs],
  );
  // The section appears once every row has its excerpt, so no row fills in after the others.
  const relatedDocDetails = useDocumentDetails(relatedDocRefs, { headings: false });
  const primaryRelatedDocSlug = relatedDocs[0]?.doc.slug ?? null;

  return {
    isContainerNode,
    displayName,
    referencedBy,
    integrityIssueLabels,
    missingDependencyIssues,
    completenessInsight,
    freshnessInsight,
    impactInsight,
    dependencyRelations,
    referencedByRelations,
    relationshipSummary: project ? relationshipSummaryMessage(project, referencedBy.length) : null,
    nextProjects: project ? pickNextProjects(dependencyRelations, referencedByRelations) : [],
    relatedDocs,
    relatedDocDetails,
    primaryRelatedDocSlug,
    detailHref: project ? getProjectRuntimeDetailHref(project.slug) : "#",
    docsVaultHref: buildDocsVaultHref({ slug: primaryRelatedDocSlug }),
  };
}
