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
export {
  subscribeOntologyRelations,
  upsertOntologyRelation,
  seedDefaultOntologyRelationsIfEmpty,
} from './api';
