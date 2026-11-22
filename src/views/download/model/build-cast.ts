/**
 * The sample repository the download page's build-with-Moru section plays with: a shop app whose
 * first map an agent writes in clusters (the project, three domains and their capabilities), two
 * concepts it names the way the code does, two it writes but leaves standing alone, the relations
 * it draws, the two the person adds, and one commit. Positions are percentages of the stage: `at`
 * for a wide stage, `atTall` for a phone's.
 */

export type BuildConceptId =
  | 'shop'
  | 'shopping'
  | 'catalog'
  | 'search'
  | 'cart'
  | 'orders'
  | 'payment'
  | 'shipping'
  | 'coupon'
  | 'members'
  | 'login'
  | 'profile'
  | 'refund'
  | 'alerts';

export type BuildKind = 'project' | 'domain' | 'capability';

export interface BuildConcept {
  id: BuildConceptId;
  kind: BuildKind;
  parent: BuildConceptId | null;
  beat: number;
  files: number;
  at: { x: number; y: number };
  atTall: { x: number; y: number };
}

export interface BuildRelation {
  from: BuildConceptId;
  to: BuildConceptId;
  label: 'findsItems' | 'readsTotal' | 'needsLogin' | 'reversesPayment' | 'sendsUpdates';
  labelAt: number;
  by: 'agent' | 'person';
}

export const BUILD_REPO = 'shop-app';

export const BUILD_CONCEPTS: readonly BuildConcept[] = [
  { id: 'shop', kind: 'project', parent: null, beat: 2, files: 2, at: { x: 50, y: 58 }, atTall: { x: 50, y: 52 } },
  { id: 'shopping', kind: 'domain', parent: 'shop', beat: 3, files: 1, at: { x: 25, y: 31 }, atTall: { x: 24, y: 36 } },
  { id: 'catalog', kind: 'capability', parent: 'shopping', beat: 3, files: 3, at: { x: 9, y: 15 }, atTall: { x: 12, y: 23 } },
  { id: 'search', kind: 'capability', parent: 'shopping', beat: 3, files: 2, at: { x: 31, y: 10 }, atTall: { x: 40, y: 23 } },
  { id: 'cart', kind: 'capability', parent: 'shopping', beat: 3, files: 3, at: { x: 33, y: 47 }, atTall: { x: 14, y: 47 } },
  { id: 'orders', kind: 'domain', parent: 'shop', beat: 4, files: 1, at: { x: 72, y: 30 }, atTall: { x: 76, y: 36 } },
  { id: 'payment', kind: 'capability', parent: 'orders', beat: 4, files: 3, at: { x: 64, y: 52 }, atTall: { x: 66, y: 50 } },
  { id: 'shipping', kind: 'capability', parent: 'orders', beat: 4, files: 2, at: { x: 89, y: 47 }, atTall: { x: 90, y: 45 } },
  { id: 'coupon', kind: 'capability', parent: 'orders', beat: 4, files: 2, at: { x: 86, y: 22 }, atTall: { x: 80, y: 23 } },
  { id: 'members', kind: 'domain', parent: 'shop', beat: 5, files: 1, at: { x: 27, y: 75 }, atTall: { x: 22, y: 72 } },
  { id: 'login', kind: 'capability', parent: 'members', beat: 5, files: 2, at: { x: 46, y: 88 }, atTall: { x: 44, y: 87 } },
  { id: 'profile', kind: 'capability', parent: 'members', beat: 5, files: 2, at: { x: 9, y: 89 }, atTall: { x: 12, y: 88 } },
  { id: 'refund', kind: 'capability', parent: null, beat: 6, files: 2, at: { x: 70, y: 86 }, atTall: { x: 73, y: 74 } },
  { id: 'alerts', kind: 'capability', parent: null, beat: 6, files: 1, at: { x: 91, y: 80 }, atTall: { x: 82, y: 90 } },
];

export const BUILD_RELATIONS: readonly BuildRelation[] = [
  { from: 'search', to: 'catalog', label: 'findsItems', labelAt: 0.5, by: 'agent' },
  { from: 'payment', to: 'cart', label: 'readsTotal', labelAt: 0.62, by: 'agent' },
  { from: 'payment', to: 'login', label: 'needsLogin', labelAt: 0.7, by: 'agent' },
  { from: 'refund', to: 'payment', label: 'reversesPayment', labelAt: 0.6, by: 'person' },
  { from: 'shipping', to: 'alerts', label: 'sendsUpdates', labelAt: 0.5, by: 'person' },
];

export const PERSON_RELATIONS = BUILD_RELATIONS.filter((relation) => relation.by === 'person');

export const CODE_NAMED = [
  { concept: 'coupon', title: 'couponManager' },
  { concept: 'login', title: 'authService' },
] as const satisfies readonly { concept: BuildConceptId; title: string }[];
export type CodeNamedId = (typeof CODE_NAMED)[number]['concept'];

export const LONE_CONCEPTS: readonly BuildConceptId[] = ['refund', 'alerts'];
export const loneEndOf = (relation: BuildRelation) => (LONE_CONCEPTS.includes(relation.from) ? relation.from : relation.to);

export const BUILD_CHANGE = { concept: 'payment', file: 'src/payment/charge-card.ts', sha: '4f2a91c' } as const satisfies {
  concept: BuildConceptId;
  file: string;
  sha: string;
};

export const BUILD_FILE_COUNT = BUILD_CONCEPTS.reduce((sum, concept) => sum + concept.files, 0);

export const conceptOf = (id: BuildConceptId) => BUILD_CONCEPTS.find((concept) => concept.id === id)!;
export const fileNameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const touchesChange = (relation: BuildRelation) => relation.from === BUILD_CHANGE.concept || relation.to === BUILD_CHANGE.concept;
export const dependsOnChange = (relation: BuildRelation) => relation.to === BUILD_CHANGE.concept;
