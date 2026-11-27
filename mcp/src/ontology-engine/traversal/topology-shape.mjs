import { compareText } from '../../compare-text.mjs';

export function normalizeCycle(nodes, edges) {
  let startIndex = 0;
  for (let i = 1; i < nodes.length; i += 1) {
    if (compareText(nodes[i], nodes[startIndex]) < 0) startIndex = i;
  }
  const rotatedNodes = [...nodes.slice(startIndex), ...nodes.slice(0, startIndex)];
  const rotatedEdges = [...edges.slice(startIndex), ...edges.slice(0, startIndex)];
  const closedNodes = [...rotatedNodes, rotatedNodes[0]];
  return {
    key: rotatedNodes.join('->'),
    nodes: closedNodes,
    edges: rotatedEdges,
  };
}

export function limitLayers(layers, limit) {
  const out = [];
  let remaining = limit;
  for (const layer of layers) {
    if (remaining <= 0) break;
    const nodes = layer.nodes.slice(0, remaining);
    out.push({
      rank: layer.rank,
      nodes,
      limited: layer.nodes.length > nodes.length,
    });
    remaining -= nodes.length;
  }
  return out;
}
