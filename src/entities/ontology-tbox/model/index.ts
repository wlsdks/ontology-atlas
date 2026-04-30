export type {
  OntologyTBoxVersion,
  OntologyTBoxVersionInput,
  OntologyTBoxActiveState,
  OntologyTBoxActiveStateInput,
} from './types';
export {
  versionFromFirestore,
  versionToFirestore,
  activeStateFromFirestore,
  activeStateToFirestore,
} from './mapper';
