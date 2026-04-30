import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions/v2";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Gemini extraction schema (JSON mode).
 * 기존 stub 과 동일한 contract 를 유지해 downstream 파이프라인을 그대로 재사용.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "문서 전체를 1~2문장으로 요약 (한글)",
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tempId: { type: "string" },
          title: { type: "string" },
          kind: {
            type: "string",
            enum: ["document", "project", "domain", "capability", "element", "concept"],
          },
          projectIds: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          confidence: { type: "number" },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: ["tempId", "title", "kind", "summary", "confidence"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tempId: { type: "string" },
          fromTempId: { type: "string" },
          toTempId: { type: "string" },
          type: {
            type: "string",
            enum: [
              "references_project",
              "describes_domain",
              "has_capability",
              "has_element",
              "relates_concept",
            ],
          },
          label: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["tempId", "fromTempId", "toTempId", "type", "label", "confidence"],
      },
    },
  },
  required: ["summary", "nodes", "edges"],
};

function buildPrompt({ title, kind, projectIds, markdown, documentVersionId }) {
  const projectHint =
    projectIds.length > 0
      ? `연결된 프로젝트 slug: ${projectIds.join(", ")}`
      : "연결된 프로젝트: 없음 (필요하면 문서에서 추론)";

  return `당신은 기술 문서에서 구조화된 지식을 추출하는 전문가입니다.

# 문서 메타데이터
- 제목: ${title}
- 문서 유형: ${kind} (spec/note/guide/policy/decision/research/workflow/api 중 하나)
- ${projectHint}
- documentVersionId: ${documentVersionId}

# 문서 본문 (markdown)
\`\`\`markdown
${markdown}
\`\`\`

# 작업
이 문서에서 다음을 뽑아 JSON 으로 반환합니다.

## 1. 노드 (nodes)
문서가 언급하는 개념을 종류별로 추출합니다.

- **document** (정확히 1개, 루트 역할): tempId="${documentVersionId}-document", title=문서 제목, kind="document", summary=문서 1줄 요약
- **project**: 문서가 설명/언급하는 프로젝트 slug. projectIds 가 주어졌으면 각각 project 노드로 만들고 title=slug
- **domain**: 문서가 속한 도메인 (예: "결제", "인증", "observability")
- **capability**: 기능/역할 (예: "토큰 발급", "주문 집계")
- **element**: 구성 요소/모듈 (예: "Redis 캐시", "Gateway")
- **concept**: 관련 개념·용어 (모호하거나 위 분류에 안 맞는 것)

각 노드:
- tempId: 문서 내에서 유니크한 ID (예: "${documentVersionId}-domain-1")
- title: 짧은 이름 (한글 원문이 있으면 한글 우선)
- kind: 위 6종 중 하나
- projectIds: 이 노드와 연관된 project slug 배열 (없으면 빈 배열)
- summary: 1문장 설명
- confidence: 0.0 ~ 1.0 (문서에서 명시적이고 근거가 뚜렷하면 0.9+, 추측이면 0.5 이하)
- warnings: 불확실한 점 배열 (없으면 빈 배열)

## 2. 엣지 (edges)
노드 사이 관계를 표현합니다. 반드시 아래 6종 type 중 하나:

- **references_project**: document → project (문서가 언급한 프로젝트)
- **describes_domain**: document → domain
- **has_capability**: domain/project → capability
- **has_element**: capability/domain → element
- **relates_concept**: document → concept (관련 개념)

각 엣지:
- tempId, fromTempId, toTempId (모두 노드의 tempId 와 일치해야 함)
- type, label (한글 짧은 라벨), confidence

# 규칙
1. 반드시 document 노드 1개를 루트로. 모든 project 와 domain 에는 document 로부터 엣지.
2. capability 는 domain 이나 project 아래로.
3. element 는 capability 아래로 (없으면 domain 아래).
4. concept 는 document 와 직접 연결.
5. 문서에 없는 내용은 추측하지 않음. 확실한 것만. 빈 배열도 OK.
6. 한국어 문서는 한국어로, 영어 문서는 영어로 title·summary 유지.
7. 반드시 유효한 JSON 으로만 응답 (마크다운·주석·prose 금지).`;
}

/**
 * Gemini 호출로 markdown 을 추출해 nodes/edges 를 만든다.
 * 성공 시 { summary, nodes, edges } 반환. 실패 시 예외.
 *
 * 호출부는 이 결과를 받아 stub 과 동일한 output record 형태로 감싸 저장.
 * API key 가 없으면 즉시 예외 — 호출부가 stub fallback 판단.
 */
export async function extractWithGemini({
  markdown,
  title,
  kind,
  projectIds,
  documentVersionId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: DEFAULT_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const prompt = buildPrompt({
    title,
    kind,
    projectIds,
    markdown,
    documentVersionId,
  });

  // 수동 타임아웃 — SDK 가 자체 타임아웃 옵션을 노출하지 않고 AbortSignal 도
  // 지원 안 함. Promise.race 로 시간 초과시 명시적 reject → 호출부가 stub
  // fallback 으로 빠지게 보장. 실제로 행 걸려도 Cloud Function 전체 timeout
  // (540s) 까지 기다리는 비용 낭비를 막는다.
  const extractionPromise = model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Gemini extraction timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    const response = await Promise.race([extractionPromise, timeoutPromise]);
    const text = response?.response?.text?.() ?? "";
    if (!text) {
      throw new Error("empty response from Gemini");
    }
    const parsed = JSON.parse(text);
    validateExtraction(parsed, documentVersionId);
    return parsed;
  } catch (err) {
    logger.warn("[gemini] extraction failed:", err?.message || err);
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function validateExtraction(data, documentVersionId) {
  if (!data || typeof data !== "object") {
    throw new Error("invalid extraction: not an object");
  }
  if (typeof data.summary !== "string") {
    throw new Error("invalid extraction: summary missing");
  }
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error("invalid extraction: nodes/edges not arrays");
  }
  const documentNode = data.nodes.find(
    (node) => node.kind === "document" && node.tempId === `${documentVersionId}-document`,
  );
  if (!documentNode) {
    throw new Error("invalid extraction: document root node missing");
  }
  const tempIds = new Set(data.nodes.map((node) => node.tempId));
  for (const edge of data.edges) {
    if (!tempIds.has(edge.fromTempId) || !tempIds.has(edge.toTempId)) {
      throw new Error(
        `invalid extraction: edge ${edge.tempId} references unknown tempId`,
      );
    }
  }
}
