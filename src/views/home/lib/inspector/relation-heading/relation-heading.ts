interface HeadingGroup {
  rows: readonly { kind: string; relationTypes?: readonly string[] }[];
  allRows?: readonly { kind: string; relationTypes?: readonly string[] }[];
  total: number;
}

function completeGroupRows(group: HeadingGroup) {
  const rows = group.allRows ?? group.rows;
  if (rows.length === 0 || rows.length !== group.total) return null;
  return rows;
}

function completeGroupKind(group: HeadingGroup): string | null {
  const rows = completeGroupRows(group);
  if (!rows) return null;
  const kind = rows[0].kind;
  return rows.every((row) => row.kind === kind) ? kind : null;
}

export function relationHeadingKeys(
  selectedKind: string,
  groups: { contains: HeadingGroup; belongsTo: HeadingGroup; dependsOn: HeadingGroup; usedBy: HeadingGroup },
) {
  const childKind = completeGroupKind(groups.contains);
  const parentKind = completeGroupKind(groups.belongsTo);
  const allDependencies = (group: HeadingGroup) => completeGroupRows(group)?.every(
    (row) => row.relationTypes !== undefined && row.relationTypes.length > 0 && row.relationTypes.every(
      (type) => type === "depends_on" || type === "dependencies",
    ),
  ) ?? false;
  const dependsOn = allDependencies(groups.dependsOn);
  const usedBy = allDependencies(groups.usedBy);
  return {
    dependsOn: dependsOn ? "nodeDatasheet.metricDependsOn" : "nodeDatasheet.metricConnectedTo",
    usedBy: usedBy ? "nodeDatasheet.metricUsedBy" : "nodeDatasheet.metricConnectedFrom",
    dependsOnHelp: dependsOn ? "nodeDatasheet.metricDependsOnHelp" : "nodeDatasheet.metricConnectedToHelp",
    usedByHelp: usedBy ? "nodeDatasheet.metricUsedByHelp" : "nodeDatasheet.metricConnectedFromHelp",
    dependsOnDomainsHelp: dependsOn ? "nodeDatasheet.metricDependsOnDomainsHelp" : "nodeDatasheet.metricConnectionsDomainsHelp",
    usedByDomainsHelp: usedBy ? "nodeDatasheet.metricUsedByDomainsHelp" : "nodeDatasheet.metricConnectionsDomainsHelp",
    contains: selectedKind === "capability" && childKind === "element"
      ? "nodeDatasheet.containsElements"
      : selectedKind === "domain" && childKind === "capability"
        ? "nodeDatasheet.containsCapabilities"
        : selectedKind === "project" && childKind === "domain"
          ? "nodeDatasheet.containsDomains"
          : "nodeDatasheet.containsItems",
    belongsTo: parentKind === "domain"
      ? "nodeDatasheet.belongsToDomain"
      : parentKind === "project"
        ? "nodeDatasheet.belongsToProject"
        : selectedKind === "element" && parentKind === "capability"
          ? "nodeDatasheet.belongsToCapability"
          : "nodeDatasheet.containedBy",
  } as const;
}
