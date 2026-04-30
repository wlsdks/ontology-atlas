/**
 * Narnia MCP server — Claude Code · Cursor 같은 MCP 클라이언트가 이 server
 * 를 등록하면, AI agent 가 자기 워크스페이스 토폴로지에 노드/허브를 push
 * 할 수 있는 도구를 자동으로 갖게 된다.
 *
 * Tool: `narnia_push_doc`
 *   - input schema 는 receiveDoc HTTP endpoint 의 body 와 1:1 매칭
 *   - 내부적으로 fetch 로 receiveDoc 호출
 *
 * 환경변수:
 *   - NARNIA_API_KEY (필수) — `/admin/api-keys/` 에서 발급한 평문
 *   - NARNIA_ACCOUNT_ID (필수) — 워크스페이스 id
 *   - NARNIA_BASE_URL (필수) — `https://<region>-<project>.cloudfunctions.net`
 *   - NARNIA_DEFAULT_PROJECT_ID (선택) — 기본 컨테이너. default "general"
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface NarniaMcpConfig {
  apiKey: string;
  accountId: string;
  baseUrl: string;
  defaultProjectId?: string;
  fetch?: typeof fetch;
}

export function createNarniaMcpServer(config: NarniaMcpConfig): Server {
  const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error("fetch unavailable; node>=18 needed");
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const defaultProjectId = config.defaultProjectId ?? "general";

  const server = new Server(
    {
      name: "project-narnia-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "narnia_push_doc",
        description:
          "Narnia 워크스페이스의 컨테이너에 hub 또는 node 한 건을 push (upsert). 같은 slug 가 있으면 update.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: {
              type: "string",
              description: `컨테이너 id. 미지정 시 "${defaultProjectId}".`,
            },
            slug: {
              type: "string",
              description: "kebab-case unique slug (컨테이너 안에서 unique).",
            },
            name: {
              type: "string",
              description: "표시 이름.",
            },
            isHub: {
              type: "boolean",
              description: "true → hubs/{slug}, false → nodes/{slug}. 기본 false.",
            },
            description: { type: "string" },
            detail: {
              type: "string",
              description: "본문 markdown.",
            },
            tags: { type: "array", items: { type: "string" } },
            stack: { type: "array", items: { type: "string" } },
            dependencies: {
              type: "array",
              items: { type: "string" },
              description: "다른 노드 slug 의존.",
            },
            hubIds: {
              type: "array",
              items: { type: "string" },
              description: "node 의 소속 hub 배열.",
            },
            owner: { type: "string" },
            icon: { type: "string" },
            progress: { type: "number" },
          },
          required: ["slug", "name"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "narnia_push_doc") {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const slug = typeof args.slug === "string" ? args.slug.trim() : "";
    const name = typeof args.name === "string" ? args.name.trim() : "";
    if (!slug) throw new Error("slug 가 필요합니다.");
    if (!name) throw new Error("name 이 필요합니다.");

    const projectId =
      typeof args.projectId === "string" && args.projectId.trim()
        ? args.projectId.trim()
        : defaultProjectId;

    const doc: Record<string, unknown> = { slug, name };
    for (const key of [
      "isHub",
      "description",
      "detail",
      "tags",
      "stack",
      "dependencies",
      "hubIds",
      "owner",
      "icon",
      "progress",
    ]) {
      if (args[key] !== undefined) doc[key] = args[key];
    }

    const response = await fetchImpl(`${baseUrl}/receiveDoc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        accountId: config.accountId,
        projectId,
        doc,
      }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // ignore
    }

    if (!response.ok) {
      const body = (payload ?? {}) as { code?: string; message?: string };
      throw new Error(
        `narnia push 실패 (HTTP ${response.status} · ${body.code ?? "internal"}): ${body.message ?? "unknown"}`,
      );
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  });

  return server;
}

export async function runNarniaMcpServer(config: NarniaMcpConfig): Promise<void> {
  const server = createNarniaMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
