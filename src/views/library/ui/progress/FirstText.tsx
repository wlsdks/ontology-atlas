import { useState } from "react";

/**
 * Text React writes once; later frames are drawn by the motion, so a re-render never puts the final
 * number over a counting one.
 */
export function FirstText({ text }: { text: string }) {
  const [first] = useState(text);
  return <>{first}</>;
}
