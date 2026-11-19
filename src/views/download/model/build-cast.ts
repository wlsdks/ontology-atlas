/**
 * The sample repository the download page's build-with-Moru section plays with: a small shop app
 * of eight files, three concepts the agent writes (one under a name that reads like code), the
 * relation it writes, the one it leaves out, and one commit. Positions are percentages of the
 * stage, so one cast serves a phone's square stage and a desktop's wide one.
 */

export type BuildConceptId = 'cart' | 'payment' | 'account';

export interface BuildConcept {
  id: BuildConceptId;
  /** The folder the files sit in, which the concept's Markdown cites as its path. */
  folder: string;
  at: { x: number; y: number };
}

export interface BuildFile {
  path: string;
  concept: BuildConceptId;
  /** Where the file floats once the folder is read, before it joins its concept. */
  loose: { x: number; y: number };
}

export interface BuildRelation {
  from: BuildConceptId;
  to: BuildConceptId;
  /** Message key under `download.build.relations`. */
  label: 'readsTotal' | 'needsLogin';
  /** Where along the line, from `from` to `to`, its label sits clear of both names. */
  labelAt: number;
  /** The agent writes its relation while building; the person adds the one it left out. */
  by: 'agent' | 'person';
}

export const BUILD_REPO = 'shop-app';

export const BUILD_CONCEPTS: readonly BuildConcept[] = [
  { id: 'cart', folder: 'src/cart', at: { x: 24, y: 32 } },
  { id: 'payment', folder: 'src/payment', at: { x: 74, y: 50 } },
  { id: 'account', folder: 'src/auth', at: { x: 28, y: 76 } },
];

export const BUILD_FILES: readonly BuildFile[] = [
  { path: 'src/cart/add-item.ts', concept: 'cart', loose: { x: 24, y: 14 } },
  { path: 'src/cart/cart-total.ts', concept: 'cart', loose: { x: 70, y: 12 } },
  { path: 'src/cart/coupon.ts', concept: 'cart', loose: { x: 30, y: 32 } },
  { path: 'src/payment/charge-card.ts', concept: 'payment', loose: { x: 72, y: 30 } },
  { path: 'src/payment/refund.ts', concept: 'payment', loose: { x: 26, y: 52 } },
  { path: 'src/payment/receipt.ts', concept: 'payment', loose: { x: 68, y: 50 } },
  { path: 'src/auth/login.ts', concept: 'account', loose: { x: 32, y: 72 } },
  { path: 'src/auth/session.ts', concept: 'account', loose: { x: 70, y: 70 } },
];

export const BUILD_RELATIONS: readonly BuildRelation[] = [
  { from: 'payment', to: 'cart', label: 'readsTotal', labelAt: 0.4, by: 'agent' },
  { from: 'payment', to: 'account', label: 'needsLogin', labelAt: 0.65, by: 'person' },
];

export const AGENT_RELATION = BUILD_RELATIONS.find((relation) => relation.by === 'agent')!;
export const PERSON_RELATION = BUILD_RELATIONS.find((relation) => relation.by === 'person')!;

/**
 * The concept the agent names the way the code does; Atlas counts such a title as one to rename
 * ("Rename N concepts that read like code"), and the person gives it a word people use.
 */
export const CODE_NAMED = { concept: 'account', title: 'authService' } as const satisfies { concept: BuildConceptId; title: string };

/** The commit an agent makes after the map exists; its file belongs to one concept. */
export const BUILD_CHANGE = { concept: 'payment', file: 'src/payment/charge-card.ts', sha: '4f2a91c' } as const satisfies {
  concept: BuildConceptId;
  file: string;
  sha: string;
};

export const fileNameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const filesOf = (concept: BuildConceptId) => BUILD_FILES.filter((file) => file.concept === concept);
