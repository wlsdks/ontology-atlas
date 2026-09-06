import type { LintNodeCandidate } from "./lint-brief";
import { WIKI_DIR } from "@/shared/lib/wiki-page-schema";

/**
 * The brief that turns a name the wiki keeps mentioning into an ontology node — **the
 * one place the wiki flows up into the graph, and it flows through the person.**
 *
 * The Check-the-wiki report ends with names that appear on three or more pages and have
 * no page of their own. In this product that is not a wiki page to write: a wiki page is
 * what one document said; a node is what we mean. So the Library offers each name as a
 * node candidate, and pressing it starts one agent turn whose only write is
 * `add_concept` — which reaches the permission card as a typed ontology change the
 * person reads and allows or refuses. Nothing else is written: the wiki pages that
 * carry the name are the evidence, cited by link in the node's body, and `describes:`
 * on those pages stays the person's to add after review (spec §11.1).
 *
 * The agent is told to read before it proposes — the pages the report named, the
 * kinds and domains the vault already has — and to say why it chose a kind and a
 * parent, because a node with a wrong kind is a claim on the map nobody reviewed. And
 * it is told first what the map is: the code's ontology. A person, a contractor, a
 * date is not a node however often the wiki names it; the brief says to create none
 * and say so, which is the same boundary the Library enforces by offering the chip
 * only for domain, capability and element.
 */

export interface ProposeNodeBriefInput {
  candidate: LintNodeCandidate;
  locale: string;
  vaultRoot: string;
}

const KIND_LINE: Record<string, string> = {
  domain: "domain",
  capability: "capability",
  element: "element",
};

export function buildProposeNodeBrief({ candidate, locale, vaultRoot }: ProposeNodeBriefInput): string {
  const pages = candidate.pages.length > 0 ? candidate.pages.map((slug) => `- ${slug}.md`).join("\n") : "- (the report named no pages)";
  if (locale === "ko") {
    return [
      `"${candidate.name}" 을(를) 이 폴더의 온톨로지 노드로 제안해 줘.`,
      "",
      `폴더: ${vaultRoot}`,
      "",
      `위키 점검이 이 이름을 문서 없는 이름으로 찾았어${candidate.why ? `: ${candidate.why}` : "."}`,
      `보고된 종류: ${candidate.kind}`,
      "이 이름이 나오는 위키 문서:",
      pages,
      "",
      "순서:",
      "0. 지도는 코드의 온톨로지야. 이 이름이 코드가 만드는 것(시스템, 서비스, 부품, 기능 영역)이 아니라 사람·조직·날짜·결정이면 노드를 만들지 말고 그렇다고 답해. 그 이름은 위키에 남는 게 맞아.",
      "1. 위 위키 문서들을 읽어. 위키는 문서가 말한 것이고, 노드는 우리가 뜻하는 것이야. 이 이름이 실제로 무엇인지 문서에서 확인해.",
      "2. `list_kinds` 와 `list_concepts` 로 이 볼트에 이미 있는 종류와 도메인을 봐. 같은 뜻의 노드가 이미 있으면 새로 만들지 말고 그 슬러그를 답해.",
      "3. `add_concept` 을 **한 번** 불러. kind 는 domain / capability / element / document 중 하나, 부모 domain 은 있는 것 중에서 고르고, body 에는 이 이름이 나오는 위키 문서를 `[[wiki/<슬러그>]]` 로 인용해서 근거로 남겨. 왜 그 kind 와 그 부모인지 body 첫 줄에 한 문장으로 적어.",
      "4. 다른 것은 쓰지 마. 위키 문서를 고치지 말고 `describes:` 도 넣지 마. 그건 사람이 검토한 뒤에 하는 일이야.",
      "",
      "쓰기는 사람의 허락을 기다려. 허락 카드에 뜨는 것이 곧 제안이야.",
    ].join("\n");
  }
  return [
    `Propose "${candidate.name}" as an ontology node in this folder.`,
    "",
    `Folder: ${vaultRoot}`,
    "",
    `Check-the-wiki found this name with no page of its own${candidate.why ? `: ${candidate.why}` : "."}`,
    `Reported kind: ${KIND_LINE[candidate.kind] ?? candidate.kind}`,
    "Wiki pages that carry the name:",
    pages,
    "",
    "In this order:",
    "0. The map is the code's ontology. If this name is not something the code builds — a system, a service, a component, an area of function — but a person, an organisation, a date or a decision, create no node and say so; the name belongs in the wiki.",
    "1. Read those wiki pages. A wiki page is what a document said; a node is what we mean. Confirm from the pages what the name actually is.",
    "2. Read the vault's own kinds and domains with `list_kinds` and `list_concepts`. If a node with the same meaning already exists, do not create another; answer with its slug instead.",
    `3. Call \`add_concept\` **once**: kind is one of domain / capability / element / document, the parent domain is one that exists, and the body cites the wiki pages that carry the name as \`[[${WIKI_DIR}/<slug>]]\` links so the evidence stays attached. Say in the body's first sentence why that kind and that parent.`,
    "4. Write nothing else. Do not edit the wiki pages and do not add `describes:` to them; that is the person's to do after review.",
    "",
    "The write waits for the person's approval. What the permission card shows is the proposal.",
  ].join("\n");
}
