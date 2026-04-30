import { describe, expect, it } from "vitest";
import { parseProjectsCsv } from "./csv-parse";

describe("parseProjectsCsv", () => {
  it("기본 필수 필드로 유효한 프로젝트를 파싱한다", () => {
    const csv = [
      "slug,name,category,status,description",
      "checkout,결제 서비스,in-progress,developing,결제 처리",
    ].join("\n");

    const result = parseProjectsCsv(csv);

    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      slug: "checkout",
      name: "결제 서비스",
      category: "in-progress",
      status: "developing",
      description: "결제 처리",
    });
  });

  it("빈 입력은 빈 결과", () => {
    expect(parseProjectsCsv("")).toEqual({ valid: [], errors: [] });
    expect(parseProjectsCsv("   \n  \n")).toEqual({ valid: [], errors: [] });
  });

  it("헤더만 있고 행이 없으면 빈 결과", () => {
    const result = parseProjectsCsv("slug,name,category,status,description");
    expect(result).toEqual({ valid: [], errors: [] });
  });

  it("필수 헤더가 빠지면 전체 에러", () => {
    const result = parseProjectsCsv("slug,name\nx,y");
    expect(result.valid).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("필수 헤더");
  });

  it("dependencies 는 파이프(|)로 구분된 slug 들", () => {
    const csv = [
      "slug,name,category,status,description,dependencies",
      "checkout,결제,in-progress,developing,desc,iam|api-gw",
    ].join("\n");

    const result = parseProjectsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.valid[0].dependencies).toEqual(["iam", "api-gw"]);
  });

  it("tags / stack 도 파이프 구분", () => {
    const csv = [
      "slug,name,category,status,description,tags,stack",
      "x,X,in-progress,developing,d,Auth|Hub,Node.js|PostgreSQL",
    ].join("\n");

    const result = parseProjectsCsv(csv);
    expect(result.valid[0].tags).toEqual(["Auth", "Hub"]);
    expect(result.valid[0].stack).toEqual(["Node.js", "PostgreSQL"]);
  });

  it("slug 공백 제거 + 필수 필드 빈 값이면 행 단위 에러", () => {
    const csv = [
      "slug,name,category,status,description",
      "  checkout  ,결제,in-progress,developing,설명",
      ",빈슬러그,in-progress,developing,설명",
    ].join("\n");

    const result = parseProjectsCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].slug).toBe("checkout");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(3); // 헤더 1 + 2번째 데이터 행
    expect(result.errors[0].message).toContain("slug");
  });

  it("isHub 는 true/false/yes/no/1/0 허용", () => {
    const csv = [
      "slug,name,category,status,description,isHub",
      "a,A,in-progress,developing,d,true",
      "b,B,in-progress,developing,d,FALSE",
      "c,C,in-progress,developing,d,yes",
      "d,D,in-progress,developing,d,0",
    ].join("\n");

    const result = parseProjectsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.valid.map((p) => p.isHub)).toEqual([true, false, true, false]);
  });

  it("isHub 파싱 불가 값이면 행 에러", () => {
    const csv = [
      "slug,name,category,status,description,isHub",
      "a,A,in-progress,developing,d,maybe",
    ].join("\n");

    const result = parseProjectsCsv(csv);
    expect(result.valid).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("isHub");
  });

  it("중복 slug 는 둘째 이후 행을 에러로", () => {
    const csv = [
      "slug,name,category,status,description",
      "dup,A,in-progress,developing,a",
      "dup,B,in-progress,developing,b",
    ].join("\n");

    const result = parseProjectsCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].name).toBe("A");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(3);
    expect(result.errors[0].message).toContain("중복");
  });

  it("쌍따옴표 안의 쉼표는 구분자로 취급하지 않는다", () => {
    const csv = [
      "slug,name,category,status,description",
      'x,X,"in-progress",developing,"결제, 배송까지 한번에"',
    ].join("\n");

    const result = parseProjectsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.valid[0].description).toBe("결제, 배송까지 한번에");
  });

  it("BOM 이 있는 파일도 첫 헤더를 올바로 인식", () => {
    const csv = `\uFEFFslug,name,category,status,description\nx,X,in-progress,developing,d`;
    const result = parseProjectsCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(1);
  });
});
