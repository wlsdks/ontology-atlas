import { slugify } from "./slugify";

/**
 * Canonicalizes a `domain:` reference to the domain document's own address
 * (`domains/inquiry-processing`). A bare value stays bare, since the folder may not exist. Only
 * the last segment is slugified; empty input returns an empty string.
 */
export function canonicalizeDomainRef(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.md$/i, "");
  if (!trimmed) return "";
  const segments = trimmed
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const tailRaw = segments.pop() ?? trimmed;
  const tail = slugify(tailRaw).replace(/^-+|-+$/g, "") || tailRaw;
  return segments.length > 0 ? `${segments.join("/")}/${tail}` : tail;
}
