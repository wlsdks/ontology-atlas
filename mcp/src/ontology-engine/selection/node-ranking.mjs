import { compareText } from '../../compare-text.mjs';

export function degreeBucket(degree) {
  if (degree <= 0) return '0';
  if (degree === 1) return '1';
  if (degree <= 4) return '2-4';
  if (degree <= 9) return '5-9';
  return '10+';
}

export function topHubs(nodes, limit) {
  return [...nodes]
    .map((node) => ({
      uid: node.uid,
      slug: node.slug,
      kind: node.kind,
      title: node.title,
      domain: node.domain,
      inDegree: node.inDegree || 0,
      outDegree: node.outDegree || 0,
      degree: (node.inDegree || 0) + (node.outDegree || 0),
    }))
    .sort((a, b) => b.degree - a.degree || b.inDegree - a.inDegree || compareText(a.slug, b.slug))
    .slice(0, limit);
}

export function sortLineageRows(rows) {
  return [...rows].sort((a, b) => a.distance - b.distance || compareText(a.slug, b.slug));
}

export function compareNodeRows(left, right, sort) {
  if (sort === 'slug') return compareText(left.slug, right.slug);
  const leftValue = left[sort] || 0;
  const rightValue = right[sort] || 0;
  if (rightValue !== leftValue) return rightValue - leftValue;
  if (sort !== 'degree') {
    const leftDegree = left.degree || 0;
    const rightDegree = right.degree || 0;
    if (rightDegree !== leftDegree) return rightDegree - leftDegree;
  }
  return compareText(left.slug, right.slug);
}

export function compareCentralityRows(left, right) {
  if (right.pageRank !== left.pageRank) return right.pageRank - left.pageRank;
  if (right.degree !== left.degree) return right.degree - left.degree;
  return compareText(left.slug, right.slug);
}
