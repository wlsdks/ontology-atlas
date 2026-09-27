import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { projectFormSchema, type ProjectFormValues } from "./schema";

/** `zodResolver` stays compatible with `projectFormSchema` and its form defaults. */
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

  it("reports slug, name, category and status errors for missing required input", async () => {
    const result = await resolver(emptyValues(), undefined, {
      criteriaMode: "firstError",
      shouldUseNativeValidation: false,
      fields: {},
    });
    expect(Object.keys(result.errors).length).toBeGreaterThan(0);
  });

  it("passes minimal valid input with description and progress without errors", async () => {
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

  it("tracks dirtiness through setValue and clears it on reset", async () => {
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

    act(() => {
      result.current.setValue("name", "수정된 이름", { shouldDirty: true });
    });
    expect(result.current.formState.isDirty).toBe(true);

    const parsed: ProjectFormValues = {
      ...initial,
      name: "수정된 이름",
    };
    act(() => {
      result.current.reset(parsed);
    });
    expect(result.current.formState.isDirty).toBe(false);
  });

  it("reports validation.descriptionRequired when the description is missing", async () => {
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
