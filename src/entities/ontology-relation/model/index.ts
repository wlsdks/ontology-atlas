export type {
  OntologyRelation,
  OntologyRelationInput,
  OntologyRelationCategory,
} from './types';
export {
  DEFAULT_ONTOLOGY_RELATIONS,
  isOntologyRelationId,
  isRelationApplicable,
} from './defaults';
export { fromFirestore, toFirestore } from './mapper';
