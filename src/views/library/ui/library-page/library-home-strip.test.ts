import { describe, expect, it, vi } from "vitest";

import type { LibraryUiModel, RetainedAnswerHead } from "@/features/library";

import { libraryHomeStrip } from "./library-home-strip";

type Strip = Parameters<typeof libraryHomeStrip>[0];

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}(${JSON.stringify(values)})` : key) as unknown as Strip["t"];

const answer = (slug: string, title: string) => ({ slug, title }) as RetainedAnswerHead;

function questionsDoor(retainedAnswers: readonly RetainedAnswerHead[]) {
  const choose = vi.fn();
  const { homeDoors } = libraryHomeStrip({
    t, homeSurface: null, setHomeSurface: vi.fn(), choose,
    model: { sources: [] } as unknown as LibraryUiModel,
    retainedAnswers, onOpenConversation: null, onReview: null,
  });
  return { door: homeDoors.find((door) => door.id === "questions")!, choose };
}

describe("library header questions door", () => {
  it("names its action, not the answer title, when it opens the one saved answer", () => {
    const { door, choose } = questionsDoor([answer("wiki/answers/delivery", "What is the delivery rule?")]);
    expect(door.label).toBe("home.openAnswer");
    expect(door.tooltip).toBe("What is the delivery rule?");
    door.onPress();
    expect(choose).toHaveBeenCalledWith({ kind: "wiki", slug: "wiki/answers/delivery" });
  });

  it("names the questions list with its count when several answers are saved", () => {
    const { door } = questionsDoor([answer("wiki/answers/a", "A"), answer("wiki/answers/b", "B")]);
    expect(door.label).toBe('home.questions({"count":2})');
    expect(door.tooltip).toBeUndefined();
  });
});
