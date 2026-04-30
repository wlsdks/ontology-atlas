import type { ReactNode } from "react";
import { Button } from "@/shared/ui";

/**
 * tablist 안에서 panel 토글용 button. ARIA tab pattern (`role="tab"` +
 * `aria-selected` + `aria-controls` + `tabIndex`) 을 일괄 적용.
 *
 * 호출자: `KnowledgeDocumentDetailPage` 의 overview / compare / result 3 panel
 * 토글 row.
 */
export function PanelButton({
  id,
  active,
  controls,
  onClick,
  children,
}: {
  id: string;
  active: boolean;
  controls: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      id={id}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      type="button"
      variant={active ? "primary" : "outline"}
      size="sm"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
