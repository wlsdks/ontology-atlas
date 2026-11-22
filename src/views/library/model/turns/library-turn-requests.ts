/**
 * What opens the conversation dock. Closing puts the conversation away without ending it; leaving the
 * Library parks a running check and a turn that may write, while a desk answer, a report or a refresh
 * ends with the Library.
 */
export interface LibraryAgentOpeningRequest {
  /**
   * `compile` writes pages under the permission gate; `lint` reads them and reports; `propose` writes one
   * node through the ontology-write card; `import` fetches from a connected service into `sources/` or
   * `planning/`. The attribute says which, or an import turn reads as a compile that misbehaved.
   */
  kind: "compile" | "lint" | "propose" | "import" | "ask" | "fix" | "refresh";
  text: string;
  nonce: number;
  /** For `compile`: the source paths the brief names, which the vault log records for the turn. */
  sources?: readonly string[];
}

/** The question desk's ask for a summary report of what a search found. */
export interface QuestionDeskReportRequest {
  brief: string;
  question: string;
  searchId: number;
  listingVersion: string;
  vaultScope: string;
  coverage: string;
  limits: string;
}
