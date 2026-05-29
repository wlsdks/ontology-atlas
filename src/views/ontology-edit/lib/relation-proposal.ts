/**
 * Re-export shim — 실제 구현은 S3.0(ontology-first 재구성)에서
 * `@/entities/docs-vault/lib/relation-proposal` 로 이동했다. 토폴로지(views/home)와
 * 빌더(views/ontology-edit)가 cross-view import 없이 같은 관계 제안/preflight/
 * frontmatter patch 로직을 공유하기 위함. 기존 빌더 callsite 는 경로 변경 없이
 * 이 shim 으로 그대로 동작한다.
 */
export * from "@/entities/docs-vault/lib/relation-proposal";
