export type {
  OntologyClass,
  OntologyClassInput,
  OntologyElementType,
} from './model';
export {
  DEFAULT_ONTOLOGY_CLASSES,
  isOntologyClassId,
  getOntologyKindLabel,
  getOntologyKindIcon,
  fromFirestore,
  toFirestore,
} from './model';
export {
  subscribeOntologyClasses,
  upsertOntologyClass,
  seedDefaultOntologyClassesIfEmpty,
} from './api';
