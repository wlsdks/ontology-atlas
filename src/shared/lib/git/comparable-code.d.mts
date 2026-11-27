/** The comment language a path is read in, or `null` when only whitespace is ignored. */
export function commentLanguageOf(path: string): string | null;

/** The file without comments (where its extension's syntax is known) and without whitespace. */
export function comparableCode(text: string, path: string): string;
