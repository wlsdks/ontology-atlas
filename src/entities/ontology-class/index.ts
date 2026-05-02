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
// API 함수는 barrel 에서 제외 — `@/entities/ontology-class/api` 로 직접
// import. 정적 그래프에 firebase/firestore 가 박히지 않게.
