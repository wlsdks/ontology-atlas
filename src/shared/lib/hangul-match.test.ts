import { describe, expect, it } from "vitest";
import {
  findHangulMatch,
  hangulIncludes,
  hangulStartsWith,
  isChosungQuery,
  toChosung,
} from "./hangul-match";

describe("toChosung", () => {
  it("음절을 초성 한 글자로 줄인다", () => {
    expect(toChosung("장바구니")).toBe("ㅈㅂㄱㄴ");
    expect(toChosung("주문서 작성")).toBe("ㅈㅁㅅ ㅈㅅ");
    expect(toChosung("회원 탈퇴")).toBe("ㅎㅇ ㅌㅌ");
  });

  it("한글이 아닌 글자는 그대로 둔다 (길이 보존)", () => {
    expect(toChosung("MCP 서버")).toBe("MCP ㅅㅂ");
    expect(toChosung("auth-login")).toBe("auth-login");
    expect(toChosung("결제 API v2")).toBe("ㄱㅈ API v2");
  });

  it("이미 낱자인 자음은 그대로 둔다", () => {
    expect(toChosung("ㅈㅂㄱㄴ")).toBe("ㅈㅂㄱㄴ");
  });
});

describe("isChosungQuery", () => {
  it("자음 낱자만으로 이뤄진 질의만 초성 질의다", () => {
    expect(isChosungQuery("ㅈㅂㄱㄴ")).toBe(true);
    expect(isChosungQuery("ㅈㅁㅅ ㅈㅅ")).toBe(true);
    expect(isChosungQuery("ㄱ")).toBe(true);
  });

  it("완성 음절·모음·영문이 섞이면 초성 질의가 아니다", () => {
    expect(isChosungQuery("장바구니")).toBe(false);
    expect(isChosungQuery("장바ㄱ")).toBe(false);
    expect(isChosungQuery("ㅏㅏ")).toBe(false);
    expect(isChosungQuery("abc")).toBe(false);
    expect(isChosungQuery("")).toBe(false);
    expect(isChosungQuery("   ")).toBe(false);
  });
});

describe("findHangulMatch — 초성 질의", () => {
  it("초성만 쳐도 이름을 찾는다", () => {
    expect(findHangulMatch("장바구니", "ㅈㅂㄱㄴ")).toEqual({ start: 0, end: 4 });
    expect(findHangulMatch("주문서 작성", "ㅈㅁㅅ")).toEqual({ start: 0, end: 3 });
  });

  it("이름 가운데에서도 초성이 맞는다", () => {
    expect(findHangulMatch("신규 회원 탈퇴", "ㅎㅇ")).toEqual({ start: 3, end: 5 });
  });

  it("초성이 다르면 찾지 못한다", () => {
    expect(findHangulMatch("장바구니", "ㅈㅁㅅ")).toBeNull();
  });

  it("공백을 포함한 초성 질의도 이름의 공백과 맞는다", () => {
    expect(findHangulMatch("주문서 작성", "ㅅ ㅈ")).toEqual({ start: 2, end: 5 });
  });

  it("띄어쓰기 없이 친 초성이 두 낱말 이름을 찾는다", () => {
    // Nobody types the space between the words they are reducing to initials.
    expect(findHangulMatch("회원 탈퇴", "ㅎㅇㅌㅌ")).toEqual({ start: 0, end: 5 });
    expect(findHangulMatch("주문서 작성", "ㅅㅈ")).toEqual({ start: 2, end: 5 });
  });
});

describe("findHangulMatch — 조합 중인 마지막 음절", () => {
  it("치는 도중의 음절이 다음 음절의 앞부분과 맞는다", () => {
    // The first query is what the IME shows halfway through the name's first
    // syllable; it must already find it.
    expect(findHangulMatch("장바구니", "자")).toEqual({ start: 0, end: 1 });
    // The second is the state right after the third syllable's initial is pressed.
    expect(findHangulMatch("장바구니", "장바ㄱ")).toEqual({ start: 0, end: 3 });
  });

  it("겹받침·겹모음은 쪼개서 앞부분으로 본다", () => {
    // A medial written as one code point is typed as two keys, so the syllable
    // that stops at the first of them is a genuine prefix.
    expect(findHangulMatch("결과 보기", "고")).toEqual({ start: 1, end: 2 });
    // A syllable with no final is a prefix of the same syllable with one; a
    // different final is not.
    expect(findHangulMatch("돌아갔다", "가")).toEqual({ start: 2, end: 3 });
    expect(findHangulMatch("돌아갔다", "각")).toBeNull();
  });

  it("마지막 음절만 부분 일치이고 앞은 정확히 맞아야 한다", () => {
    expect(findHangulMatch("장바구니", "바구")).toEqual({ start: 1, end: 3 });
    expect(findHangulMatch("장바구니", "바고")).toBeNull();
  });

  it("영문·숫자가 섞인 이름에서도 동작한다", () => {
    expect(findHangulMatch("MCP 서버 v2", "서ㅂ")).toEqual({ start: 4, end: 6 });
  });
});

describe("findHangulMatch — 한글이 없는 질의", () => {
  it("한글이 없으면 한글 경로를 타지 않는다", () => {
    expect(findHangulMatch("auth-login", "login")).toBeNull();
    expect(findHangulMatch("장바구니", "cart")).toBeNull();
  });

  it("빈 질의는 매치가 아니다", () => {
    expect(findHangulMatch("장바구니", "")).toBeNull();
    expect(findHangulMatch("장바구니", "  ")).toBeNull();
  });
});

describe("hangulStartsWith / hangulIncludes", () => {
  it("startsWith 는 이름 첫머리에서만 참이다", () => {
    expect(hangulStartsWith("장바구니", "ㅈㅂ")).toBe(true);
    expect(hangulStartsWith("신규 회원 탈퇴", "ㅎㅇ")).toBe(false);
    expect(hangulIncludes("신규 회원 탈퇴", "ㅎㅇ")).toBe(true);
  });
});

describe("NFD 입력", () => {
  it("자소가 분리된 채 들어와도 같은 결과", () => {
    expect(findHangulMatch("장바구니".normalize("NFD"), "ㅈㅂㄱㄴ")).toEqual({
      start: 0,
      end: 4,
    });
    expect(hangulIncludes("장바구니", "ㅈㅂㄱㄴ".normalize("NFD"))).toBe(true);
  });
});
