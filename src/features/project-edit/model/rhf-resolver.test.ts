import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { projectFormSchema, type ProjectFormValues } from "./schema";

/**
 * Fire 6-1 — react-hook-form + zod 통합 baseline test.
 *
 * 본 test 는 RHF 의 zodResolver 가 projectFormSchema 와 정상 통합되는지
 * 검증. Fire 6-2/3/4 의 ProjectForm 마이그레이션 전에 schema↔resolver
 * 호환성을 fix 시켜 회귀 차단.
 *
 * 핵심 검증:
 * 1. valid 입력 → errors {} + values 통과
 * 2. invalid 입력 (필수 필드 누락) → errors 채워짐
 * 3. resolver 가 projectToFormValues 와 같은 사람 친화 default 와 호환
 */
describe("rhf zodResolver × projectFormSchema", () => {
  const resolver = zodResolver(projectFormSchema);

  function emptyValues(): ProjectFormValues {
    return {
      slug: "",
      name: "",
      nameEn: "",
      description: "",
      detail: "",
      category: "",
      status: "",
      tagsCsv: "",
      stackCsv: "",
      linksText: "",
      dependencies: [],
      isHub: false,
      screenshots: [],
      detailType: "markdown",
      owner: "",
      icon: "",
      startedAt: "",
      launchedAt: "",
      progress: undefined,
      sortOrder: "",
      positionX: "",
      positionY: "",
    } as ProjectFormValues;
  }

  it("필수 누락 입력 — errors 에 slug / name / category / status 표시", async () => {
    const result = await resolver(emptyValues(), undefined, {
      criteriaMode: "firstError",
      shouldUseNativeValidation: false,
      fields: {},
    });
    // resolver returns { values, errors } — errors should NOT be empty
    expect(Object.keys(result.errors).length).toBeGreaterThan(0);
  });

  it("최소 valid 입력 (description + progress 포함) — errors 비고 values 통과", async () => {
    const valid: ProjectFormValues = {
      ...emptyValues(),
      slug: "test-project",
      name: "테스트 프로젝트",
      description: "테스트 설명",
      category: "frontend",
      status: "active",
      progress: 50,
    };
    const result = await resolver(valid, undefined, {
      criteriaMode: "firstError",
      shouldUseNativeValidation: false,
      fields: {},
    });
    expect(result.errors).toEqual({});
    expect(result.values).toMatchObject({
      slug: "test-project",
      name: "테스트 프로젝트",
    });
  });

  it("dirty tracking — setValue 후 isDirty=true, reset(parsed) 후 false", async () => {
    const initial: ProjectFormValues = {
      ...emptyValues(),
      slug: "init",
      name: "초기",
      description: "초기 설명",
      category: "frontend",
      status: "active",
    };
    const { result } = renderHook(() =>
      useForm<ProjectFormValues>({
        defaultValues: initial,
        resolver: zodResolver(projectFormSchema) as never,
      }),
    );
    expect(result.current.formState.isDirty).toBe(false);

    // setValue 로 변경 — isDirty true.
    act(() => {
      result.current.setValue("name", "수정된 이름", { shouldDirty: true });
    });
    expect(result.current.formState.isDirty).toBe(true);

    // submit 성공 시뮬레이션 — reset(parsed) 후 isDirty false.
    const parsed: ProjectFormValues = {
      ...initial,
      name: "수정된 이름",
    };
    act(() => {
      result.current.reset(parsed);
    });
    expect(result.current.formState.isDirty).toBe(false);
  });

  it("description 누락 — 검증 에러 메시지 노출 ('Description is required')", async () => {
    const v: ProjectFormValues = {
      ...emptyValues(),
      slug: "x",
      name: "x",
      category: "x",
      status: "x",
      progress: 10,
      description: "",
    };
    const result = await resolver(v, undefined, {
      criteriaMode: "firstError",
      shouldUseNativeValidation: false,
      fields: {},
    });
    expect(result.errors.description).toBeDefined();
    expect((result.errors.description as { message?: string }).message).toBe(
      "Description is required",
    );
  });
});
