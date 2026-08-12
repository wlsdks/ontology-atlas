"use client";

import { useCallback, useRef, useState } from "react";

import {
  parseConstructionReviewEnvelope,
  type ConstructionEnvelopeState,
  type ConstructionReviewProjection,
} from "@/entities/construction-review";

export type ConstructionReviewSessionStatus = "idle" | "reading" | "ready" | "blocked";

export function useConstructionReviewSession(projectSlug: string) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ConstructionReviewSessionStatus>("idle");
  const [review, setReview] = useState<ConstructionReviewProjection | null>(null);
  const [errorState, setErrorState] = useState<Exclude<ConstructionEnvelopeState, "ready"> | null>(null);

  const readFile = useCallback(async (file: File) => {
    setStatus("reading");
    setReview(null);
    setErrorState(null);
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setStatus("blocked");
      setErrorState("malformed");
      return;
    }
    const parsed = parseConstructionReviewEnvelope(raw, projectSlug);
    if (!parsed.ok) {
      setStatus("blocked");
      setErrorState(parsed.state);
      return;
    }
    setReview(parsed.value);
    setStatus("ready");
  }, [projectSlug]);

  const openPicker = useCallback(() => inputRef.current?.click(), []);
  const inputProps = {
    ref: inputRef,
    type: "file" as const,
    accept: "application/json,.json",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void readFile(file);
    },
  };

  return { status, review, errorState, openPicker, readFile, inputProps };
}
