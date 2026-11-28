import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** The table body takes whole rows of what the column leaves after the toolbar and the Recently written tail. */
export function useTableFit(): {
  columnRef: RefObject<HTMLDivElement | null>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  tailRef: RefObject<HTMLDivElement | null>;
  availablePx: number | null;
} {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const [availablePx, setAvailablePx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const used = (toolbarRef.current?.offsetHeight ?? 0) + (tailRef.current?.offsetHeight ?? 0);
      setAvailablePx(Math.max(0, column.clientHeight - used));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    if (tailRef.current) observer.observe(tailRef.current);
    return () => observer.disconnect();
  }, []);
  return { columnRef, toolbarRef, tailRef, availablePx };
}
