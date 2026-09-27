/**
 * Full-detail metric strip: contains, used by, depends on and 3-step reach, each fact once, like
 * the compact datasheet's `formatV2MetricLine`.
 */

export interface FullDetailMetricValues {
  contains: number;
  usedBy: number;
  dependsOn: number;
  reach: number;
}

export interface FullDetailMetricLabels {
  contains: string;
  usedBy: string;
  dependsOn: string;
  reach: string;
}

export function formatFullDetailMetricLine(
  values: FullDetailMetricValues,
  labels: FullDetailMetricLabels,
): string {
  return [
    `${labels.contains} ${values.contains}`,
    `${labels.usedBy} ${values.usedBy}`,
    `${labels.dependsOn} ${values.dependsOn}`,
    `${labels.reach} ${values.reach}`,
  ].join(" · ");
}
