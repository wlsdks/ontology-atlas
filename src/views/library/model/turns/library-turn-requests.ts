/**
 * Closing puts the conversation away, it does not end it: the frame closes (width to zero, `inert`,
 * `aria-hidden`) while the surface stays mounted, so `useAcpSession` cleanup does not `stop()`.
 * Leaving the Library parks a running check and a turn that may write (`AcpChatPanelKeeper`), which
 * finish away; a desk answer, a report or a refresh ends with the Library.
 */
export interface LibraryAgentOpeningRequest {
  /**
   * `compile` writes pages under the permission gate; `lint` reads them and reports; `propose`
   * writes one node through the ontology-write card; `import` fetches documents from a service
   * the person connected and writes them under `sources/` or `planning/`. The dock is the same either way, but
   * the attribute has to say which, or a capture of an import turn reads as a compile that
   * behaved strangely.
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
