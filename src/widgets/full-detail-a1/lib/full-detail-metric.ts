/**
 * Full-detail A1's ONE engraved metric strip — contains N · usedBy N
 * · dependsOn N · 3-step reach N. Same "every fact appears exactly
 * once" principle as the compact datasheet's `formatV2MetricLine`
 * (`topology-v2-datasheet.ts`), extended to four segments so the reach
 * headline number also lives in the strip, not just the sentence below it.
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
