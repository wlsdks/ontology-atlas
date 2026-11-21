import { nonEmpty } from './proposal-findings.mjs';

export function validateRepositoryProposalShape(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    throw new TypeError('proposal must be an object');
  }
  if (!proposal.project || typeof proposal.project !== 'object') {
    throw new TypeError('proposal.project must be an object');
  }
  for (const field of ['domains', 'capabilities', 'elements', 'relations']) {
    if (!Array.isArray(proposal[field])) {
      throw new TypeError(`proposal.${field} must be an array`);
    }
  }
  for (const [path, concept] of [
    ['project', proposal.project],
    ...proposal.domains.map((row, index) => [`domains[${index}]`, row]),
    ...proposal.capabilities.map((row, index) => [`capabilities[${index}]`, row]),
    ...proposal.elements.map((row, index) => [`elements[${index}]`, row]),
  ]) {
    if (!concept || typeof concept !== 'object' || !nonEmpty(concept.slug)) {
      throw new TypeError(`proposal.${path}.slug must be a non-empty string`);
    }
    if (concept.evidence != null && (
      !Array.isArray(concept.evidence) ||
      concept.evidence.some((source) => !nonEmpty(source))
    )) {
      throw new TypeError(`proposal.${path}.evidence must be an array of non-empty strings`);
    }
  }
  for (const [index, capability] of proposal.capabilities.entries()) {
    if (!nonEmpty(capability.domain)) {
      throw new TypeError(`proposal.capabilities[${index}].domain must be a non-empty string`);
    }
  }
  for (const [index, element] of proposal.elements.entries()) {
    if (!nonEmpty(element.domain)) {
      throw new TypeError(`proposal.elements[${index}].domain must be a non-empty string`);
    }
    if (!nonEmpty(element.path)) {
      throw new TypeError(`proposal.elements[${index}].path must be a non-empty string`);
    }
  }
  for (const [index, relation] of proposal.relations.entries()) {
    if (!relation || typeof relation !== 'object') {
      throw new TypeError(`proposal.relations[${index}] must be an object`);
    }
    for (const field of ['from', 'to', 'type', 'why']) {
      if (!nonEmpty(relation[field])) {
        throw new TypeError(`proposal.relations[${index}].${field} must be a non-empty string`);
      }
    }
    if (relation.evidence != null && (
      !Array.isArray(relation.evidence) ||
      relation.evidence.some((source) => !nonEmpty(source))
    )) {
      throw new TypeError(`proposal.relations[${index}].evidence must be an array of non-empty strings`);
    }
  }
  if (!proposal.competencyAnswers || typeof proposal.competencyAnswers !== 'object') {
    throw new TypeError('proposal.competencyAnswers must be an object');
  }
}
