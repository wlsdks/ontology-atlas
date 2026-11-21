import type { useTranslations } from "next-intl";

export type Translator = ReturnType<typeof useTranslations<"atlasGit">>;

/** What a presentational part needs from `useTranslations`: a key and optional values to text. */
export type CopyTranslate = (key: string, values?: Record<string, string | number>) => string;
