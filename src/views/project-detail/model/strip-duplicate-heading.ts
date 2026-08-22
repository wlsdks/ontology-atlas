/**
 * Removes the body's first heading when it is the same as the page title.
 *
 * A vault `.md` usually starts with `# project name` — correct when the file is read on its own. But the
 * detail screen already carries that name in the hero at 27px, so the same sentence appears once more at
 * the top of the body. Ink drawing the same information twice is removed (Tufte).
 *
 * **Only the first heading** is considered. A heading with the same name in the middle of the body is a
 * meaningful section there and is left alone.
 */
export function stripDuplicateHeading(
  body: string | null | undefined,
  title: string | null | undefined,
): string | null {
  if (!body) return body ?? null;
  const wanted = String(title ?? "").trim();
  if (!wanted) return body;

  const lines = body.split("\n");
  // Leading blank lines are skipped — a file starting with a newline is common.
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
