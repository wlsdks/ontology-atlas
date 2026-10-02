interface WebKitGestureEvent extends UIEvent {
  readonly scale: number;
  readonly clientX: number;
  readonly clientY: number;
}

export type GesturePinchHandler = (ratio: number, clientX: number, clientY: number) => void;

export function listenForGesturePinch(element: HTMLElement, onPinch: GesturePinchHandler): () => void {
  let lastScale = 1;
  let lastPointer: { x: number; y: number } | null = null;

  const anchorOf = (event: WebKitGestureEvent): { x: number; y: number } => {
    const { clientX, clientY } = event;
    if (Number.isFinite(clientX) && Number.isFinite(clientY) && (clientX !== 0 || clientY !== 0)) {
      return { x: clientX, y: clientY };
    }
    if (lastPointer) return lastPointer;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const onPointerMove = (event: PointerEvent) => {
    lastPointer = { x: event.clientX, y: event.clientY };
  };
  const onGestureStart = (event: Event) => {
    event.preventDefault();
    lastScale = 1;
  };
  const onGestureChange = (event: Event) => {
    event.preventDefault();
    const gesture = event as WebKitGestureEvent;
    if (!(gesture.scale > 0)) return;
    const ratio = gesture.scale / lastScale;
    lastScale = gesture.scale;
    const anchor = anchorOf(gesture);
    onPinch(ratio, anchor.x, anchor.y);
  };
  const onGestureEnd = (event: Event) => {
    event.preventDefault();
  };

  element.addEventListener("pointermove", onPointerMove, { passive: true });
  element.addEventListener("gesturestart", onGestureStart, { passive: false });
  element.addEventListener("gesturechange", onGestureChange, { passive: false });
  element.addEventListener("gestureend", onGestureEnd, { passive: false });
  return () => {
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("gesturestart", onGestureStart);
    element.removeEventListener("gesturechange", onGestureChange);
    element.removeEventListener("gestureend", onGestureEnd);
  };
}
