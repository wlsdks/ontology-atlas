/**
 * Full-detail A1's ONE engraved metric strip — 담는 것 N · 이 노드를 쓰는 곳 N
 * · 이 노드가 기대는 곳 N · 3단계 도달 N. Same "every fact appears exactly
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
