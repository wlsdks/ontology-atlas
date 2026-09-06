export { OntologyChangeReview } from './ui/OntologyChangeReview';
/*
 * Only the two the card outside this feature actually calls. The rest of `change-summary` —
 * the shape readers and the slug reader — are this feature's own internals, and a barrel that
 * re-exports them would claim a public surface nobody consumes (the dead-code ratchet catches it).
 */
export { fieldNameKey, ontologyChangeHeadline } from './lib/change-summary';
