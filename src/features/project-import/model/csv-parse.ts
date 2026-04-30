import type { ProjectInput } from "@/entities/project";

export interface CsvParseError {
  /** 1-indexed 파일 상 줄 번호 (헤더 포함). */
  line: number;
  message: string;
}

export interface CsvParseResult {
  valid: ProjectInput[];
  errors: CsvParseError[];
}

const REQUIRED_HEADERS = ["slug", "name", "category", "status", "description"] as const;
const OPTIONAL_HEADERS = [
  "nameEn",
  "detail",
  "tags",
  "stack",
  "dependencies",
  "owner",
  "isHub",
] as const;
const ALL_HEADERS = new Set<string>([...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);

const TRUTHY = new Set(["true", "1", "yes", "y"]);
const FALSY = new Set(["false", "0", "no", "n", ""]);

/**
 * RFC 4180 호환 수준의 가벼운 CSV 파서. 외부 dep 을 끌어오지 않도록 직접 구현.
 * - 큰따옴표로 감싼 필드는 내부 쉼표·개행 허용
 * - 연속된 "" 은 리터럴 " 으로 이스케이프
 */
function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      current.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") {
        i += 1;
      }
      current.push(field);
      field = "";
      rows.push(current);
      current = [];
      continue;
    }
    field += ch;
  }
  // 마지막 필드·행 flush
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

function splitPipe(value: string): string[] {
  return value
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseBoolean(raw: string): boolean | "invalid" {
  const lower = raw.trim().toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;
  return "invalid";
}

export function parseProjectsCsv(input: string): CsvParseResult {
  const stripped = input.replace(/^\uFEFF/, "");
  if (!stripped.trim()) {
    return { valid: [], errors: [] };
  }

  const rows = parseCsvRows(stripped).filter(
    (row) => row.length > 0 && row.some((cell) => cell.trim().length > 0),
  );
  if (rows.length === 0) {
    return { valid: [], errors: [] };
  }

  const headers = rows[0].map((h) => h.trim());
  const missingRequired = REQUIRED_HEADERS.filter((req) => !headers.includes(req));
  if (missingRequired.length > 0) {
    return {
      valid: [],
      errors: [
        {
          line: 1,
          message: `필수 헤더가 빠졌습니다: ${missingRequired.join(", ")}. 허용되는 헤더: ${[
            ...REQUIRED_HEADERS,
            ...OPTIONAL_HEADERS,
          ].join(", ")}.`,
        },
      ],
    };
  }

  const unknownHeaders = headers.filter((h) => !ALL_HEADERS.has(h));
  const errors: CsvParseError[] = [];
  if (unknownHeaders.length > 0) {
    errors.push({
      line: 1,
      message: `알 수 없는 헤더는 무시됩니다: ${unknownHeaders.join(", ")}.`,
    });
  }

  const headerIndex = new Map<string, number>();
  headers.forEach((h, idx) => headerIndex.set(h, idx));
  const get = (row: string[], name: string) => {
    const idx = headerIndex.get(name);
    if (idx === undefined) return undefined;
    return row[idx]?.trim() ?? "";
  };

  const valid: ProjectInput[] = [];
  const seenSlugs = new Set<string>();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const line = i + 1; // 1-indexed file line

    const slug = get(row, "slug") ?? "";
    const name = get(row, "name") ?? "";
    const category = get(row, "category") ?? "";
    const status = get(row, "status") ?? "";
    const description = get(row, "description") ?? "";

    const rowErrors: string[] = [];
    if (!slug) rowErrors.push("slug 가 비어 있습니다");
    if (!name) rowErrors.push("name 이 비어 있습니다");
    if (!category) rowErrors.push("category 가 비어 있습니다");
    if (!status) rowErrors.push("status 가 비어 있습니다");
    if (!description) rowErrors.push("description 이 비어 있습니다");

    if (slug && seenSlugs.has(slug)) {
      rowErrors.push(`slug "${slug}" 가 이미 위에서 쓰였습니다 (중복)`);
    }

    let isHubValue: boolean | undefined;
    const rawIsHub = get(row, "isHub");
    if (rawIsHub !== undefined && rawIsHub !== "") {
      const parsed = parseBoolean(rawIsHub);
      if (parsed === "invalid") {
        rowErrors.push(
          `isHub 는 true/false, yes/no, 1/0 중 하나여야 합니다 (실제: "${rawIsHub}")`,
        );
      } else {
        isHubValue = parsed;
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ line, message: rowErrors.join("; ") });
      continue;
    }

    seenSlugs.add(slug);
    const input: ProjectInput = {
      slug,
      name,
      category,
      status,
      description,
      position: { x: 0, y: 0 },
    };

    const nameEn = get(row, "nameEn");
    if (nameEn) input.nameEn = nameEn;
    const detail = get(row, "detail");
    if (detail) input.detail = detail;
    const owner = get(row, "owner");
    if (owner) input.owner = owner;
    const tags = get(row, "tags");
    if (tags) input.tags = splitPipe(tags);
    const stack = get(row, "stack");
    if (stack) input.stack = splitPipe(stack);
    const dependencies = get(row, "dependencies");
    if (dependencies) input.dependencies = splitPipe(dependencies);
    if (isHubValue !== undefined) input.isHub = isHubValue;

    valid.push(input);
  }

  return { valid, errors };
}
