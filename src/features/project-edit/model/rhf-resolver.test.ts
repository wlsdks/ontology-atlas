import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { projectFormSchema, type ProjectFormValues } from "./schema";

/**
 * Baseline test for the react-hook-form + zod integration.
 *
 * Verifies that RHF's `zodResolver` integrates correctly with `projectFormSchema`, pinning
 * schema↔resolver compatibility before ProjectForm migrated onto it.
 *
 * What it checks:
 * 1. valid input → `errors` empty and `values` pass through
 * 2. invalid input (a missing required field) → `errors` populated
 * 3. the resolver is compatible with the same human-friendly defaults as `projectToFormValues`
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

    // Change via setValue — isDirty becomes true.
    act(() => {
      result.current.setValue("name", "수정된 이름", { shouldDirty: true });
    });
    expect(result.current.formState.isDirty).toBe(true);

    // Simulate a successful submit — after `reset(parsed)`, isDirty is false.
    const parsed: ProjectFormValues = {
      ...initial,
      name: "수정된 이름",
    };
    act(() => {
      result.current.reset(parsed);
    });
    expect(result.current.formState.isDirty).toBe(false);
  });

  it("description 누락 — 검증 에러 메시지 노출 ('validation.descriptionRequired')", async () => {
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
      "validation.descriptionRequired",
    );
  });
});
