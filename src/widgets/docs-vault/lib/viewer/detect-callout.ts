export type CalloutKind = 'note' | 'tip' | 'info' | 'warning' | 'danger' | 'success';

export function detectCallout(
  children: React.ReactNode,
): { kind: CalloutKind; title: string; rest: React.ReactNode } | null {
  const kids = Array.isArray(children) ? children : [children];
  const firstElementIndex = kids.findIndex(
    (c) =>
      c != null &&
      typeof c === 'object' &&
      'type' in (c as object) &&
      (c as { type?: unknown }).type !== undefined,
  );
  if (firstElementIndex === -1) return null;
  const firstElement = kids[firstElementIndex] as React.ReactElement<{
    children?: React.ReactNode;
  }>;
  const inner = firstElement.props?.children;
  const innerArr = Array.isArray(inner) ? inner : [inner];
  const firstText = innerArr[0];
  if (typeof firstText !== 'string') return null;
  const m = firstText.match(
    /^\[!(note|tip|info|warning|danger|success)\]\s*(.*?)(?:\n|$)/i,
  );
  if (!m) return null;
  const kind = m[1].toLowerCase() as CalloutKind;
  const title = m[2].trim() || kind.toUpperCase();
  const remainderText = firstText.slice(m[0].length).trimStart();
  const firstParagraphRemainder = [
    remainderText,
    ...innerArr.slice(1),
  ].filter((x) => x !== '' && x != null);
  const restKids = [...kids];
  if (firstParagraphRemainder.length > 0) {
    restKids[firstElementIndex] = {
      ...firstElement,
      props: { ...firstElement.props, children: firstParagraphRemainder },
    };
  } else {
    restKids.splice(firstElementIndex, 1);
  }
  return { kind, title, rest: restKids };
}
