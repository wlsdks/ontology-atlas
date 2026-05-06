import type { Project } from "@/entities/project";

const HEADERS = [
  "slug",
  "name",
  "category",
  "status",
  "description",
  "detail",
  "tags",
  "stack",
  "dependencies",
  "owner",
  "isHub",
] as const;

/**
 * 문자열 필드에 쉼표·따옴표·개행이 포함되면 RFC 4180 방식으로 따옴표 감싸기
 * 적용. 내부 " 은 "" 로 이스케이프. 단순 영숫자·공백은 그대로.
 */
function escapeCsvField(value: string): string {
  if (value === "") return "";
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function stringArrayToCell(values: readonly string[] | undefined): string {
  if (!values || values.length === 0) return "";
  return values.join("|");
}

/**
 * Project 배열을 CSV 문자열로 직렬화. admin-project-import 의 parser 가
 * 읽을 수 있는 동일 형식 (slug|name|category|status|description + 옵셔널
 * nameEn/detail/tags/stack/dependencies/owner/isHub) 으로 round-trip 가능.
 */
export function projectsToCsv(projects: Project[]): string {
  const lines: string[] = [HEADERS.join(",")];
  for (const project of projects) {
    const row = [
      project.slug,
      project.name,
      // R15 — vault frontmatter 누락 시 빈 셀 (ergonomic export — 사용자가
      // round-trip import 후 명시적으로 채울 수 있게).
      project.category ?? "",
      project.status ?? "",
      project.description,
      project.detail ?? "",
      stringArrayToCell(project.tags),
      stringArrayToCell(project.stack),
      stringArrayToCell(project.dependencies),
      project.owner ?? "",
      project.isHub ? "true" : "false",
    ];
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\n");
}

/**
 * CSV 파일 다운로드 트리거. Blob + a[download] 표준 패턴.
 * 브라우저에서만 실행 (window/document 접근).
 */
export function downloadProjectsCsv(
  projects: Project[],
  filename: string = "projects.csv",
): void {
  if (typeof window === "undefined") return;
  const csv = projectsToCsv(projects);
  // BOM 을 앞에 붙여 Excel 한글 깨짐 방지. UTF-8 은 BOM 없어도 되지만
  // 국내 사용자의 Excel(MS) 은 BOM 없으면 ANSI 로 읽음.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
