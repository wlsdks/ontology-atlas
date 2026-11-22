// Response-shape validators for the dogfood MCP walk: the bucket and row-group
// shapes shared by the project/domain scope tools and the growth plan.
import { matchRowsFailure } from "./shape-validators-primitives.mjs";
import { growthCandidateRowFailure } from "./shape-validators-growth.mjs";

export function candidateGroupShapeFailure(label, group, expectedTotal) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    return `${label} missing group`;
  }
  if (!Number.isInteger(group.total) || group.total < 0) {
    return `${label} missing total`;
  }
  if (group.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, group ${group.total}`;
  }
  if (typeof group.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(group.rows)) {
    return `${label} missing rows`;
  }
  if (group.rows.length > group.total) {
    return `${label} rows exceed total — rows ${group.rows.length}, total ${group.total}`;
  }
  if (!group.limited && group.rows.length !== group.total) {
    return `${label} row count mismatch — rows ${group.rows.length}, total ${group.total}`;
  }
  if (group.ignored != null && (!Number.isInteger(group.ignored) || group.ignored < 0)) {
    return `${label} malformed ignored count`;
  }
  for (const [index, row] of group.rows.entries()) {
    const rowFailure = growthCandidateRowFailure(label, row, index);
    if (rowFailure) return rowFailure;
  }
  return null;
}

export function scopeEdgeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!bucket.byRelation || typeof bucket.byRelation !== "object" || Array.isArray(bucket.byRelation)) {
    return `${label} missing byRelation`;
  }
  if (!Array.isArray(bucket.edges)) {
    return `${label} missing edges array`;
  }
  if (bucket.edges.length > bucket.total) {
    return `${label} edges exceed total — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.edges.length !== bucket.total) {
    return `${label} edge count mismatch — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.edges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      return `${label} malformed edge at index ${index}`;
    }
    if (typeof edge.from !== "string" || edge.from.length === 0) {
      return `${label} missing edge from at index ${index}`;
    }
    if (typeof edge.to !== "string" || edge.to.length === 0) {
      return `${label} missing edge to at index ${index}`;
    }
    if (typeof edge.via !== "string" || edge.via.length === 0) {
      return `${label} missing edge relation at index ${index}`;
    }
  }
  return null;
}

export function summarizedNodeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.nodes)) {
    return `${label} missing nodes array`;
  }
  if (bucket.nodes.length > bucket.total) {
    return `${label} nodes exceed total — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.nodes.length !== bucket.total) {
    return `${label} node count mismatch — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  return matchRowsFailure(label, bucket.nodes);
}

export function summarizedRowBucketFailure(label, bucket, expectedTotal = null) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (expectedTotal != null && bucket.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.rows)) {
    return `${label} missing rows`;
  }
  if (bucket.rows.length > bucket.total) {
    return `${label} rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `${label} row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  return matchRowsFailure(label, bucket.rows);
}
