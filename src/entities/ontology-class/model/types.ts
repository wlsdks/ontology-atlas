/**
 * The ontology TBox — node class (kind) definitions.
 *
 * Four layers (Project → Domain → Capability → Element) plus the Document evidence
 * node and the Unknown stub, matching 1:1 the legal values of vault frontmatter `kind:`.
 */
export interface OntologyClass {
  /** kebab-case id: 'project' / 'domain' / 'capability' / 'element' / 'document' / 'unknown'. */
  id: string;
  /** Display name — the source of truth for `getOntologyKindLabel`. */
  name: string;
  /** What the class represents. Intended for tooltips and review guidance; not rendered yet. */
  description?: string;
}
