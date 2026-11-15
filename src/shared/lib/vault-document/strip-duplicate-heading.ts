/** Only the first heading, when it repeats a name the surface already shows; a same-name section later is real. */
export function stripDuplicateHeading(
  body: string | null | undefined,
  ...shownNames: ReadonlyArray<string | null | undefined>
): string | null {
  if (!body) return body ?? null;
  const shown = new Set(shownNames.map((name) => String(name ?? "").trim()).filter(Boolean));
  if (shown.size === 0) return body;

  const lines = body.split("\n");
  let index = 0;
  while (index < lines.length && lines[index]!.trim() === "") index += 1;
  if (index >= lines.length) return body;

  const heading = lines[index]!.match(/^#{1,2}\s+(.*)$/);
  if (!heading || !shown.has(heading[1]!.trim())) return body;

  // The heading and the blank line after it must both go, or the body floats above the card.
  let after = index + 1;
  while (after < lines.length && lines[after]!.trim() === "") after += 1;
  return lines.slice(after).join("\n");
}
