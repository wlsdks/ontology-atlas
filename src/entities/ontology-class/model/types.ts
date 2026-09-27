/** A node class, one per legal `kind:` value. */
export interface OntologyClass {
  /** 'project', 'domain', 'capability', 'element', 'document' or 'unknown'. */
  id: string;
  /** The source for `getOntologyKindLabel`. */
  name: string;
  /** For tooltips and review guidance; not rendered yet. */
  description?: string;
}
