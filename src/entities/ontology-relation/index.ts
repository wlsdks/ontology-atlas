export type {
  OntologyRelation,
  OntologyRelationInput,
  OntologyRelationCategory,
} from './model';
export {
  DEFAULT_ONTOLOGY_RELATIONS,
  isOntologyRelationId,
  isRelationApplicable,
  fromFirestore,
  toFirestore,
} from './model';
// API 는 `@/entities/ontology-relation/api` 로 분리.
