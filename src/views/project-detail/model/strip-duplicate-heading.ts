/** Only the first heading, which repeats the hero title; a same-name section later is real. */
export function stripDuplicateHeading(
  body: string | null | undefined,
  title: string | null | undefined,
): string | null {
  if (!body) return body ?? null;
  const wanted = String(title ?? "").trim();
  if (!wanted) return body;

  const lines = body.split("\n");
  let index = 0;
  while (index < lines.length && lines[index]!.trim() === "") index += 1;
  if (index >= lines.length) return body;

  const heading = lines[index]!.match(/^#{1,2}\s+(.*)$/);
  if (!heading || heading[1]!.trim() !== wanted) return body;

  // The heading and the blank line after it must both go, or the body floats above the card.
  let after = index + 1;
  while (after < lines.length && lines[after]!.trim() === "") after += 1;
  return lines.slice(after).join("\n");
}
