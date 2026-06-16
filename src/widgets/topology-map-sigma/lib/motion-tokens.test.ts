import { describe, expect, it } from 'vitest';
import {
  SELECTED_FOCUS_CAMERA_BASE_MAX_DISTANCE_PX,
  SELECTED_FOCUS_CAMERA_DURATION_MS,
  SELECTED_FOCUS_CAMERA_DISTANCE_POLICY,
  SELECTED_FOCUS_CAMERA_FANOUT_ROW_DISTANCE_PX,
  SELECTED_FOCUS_CAMERA_NOOP_DISTANCE_POLICY,
  SELECTED_FOCUS_CAMERA_NOOP_STATE,
  SELECTED_FOCUS_CAMERA_NOOP_TARGET_POLICY,
  SELECTED_FOCUS_CAMERA_NOOP_TRIGGER,
  TOPOLOGY_DRAG_SETTLE_DURATION_MS,
  TOPOLOGY_DRAG_SETTLE_EASING_NAME,
  TOPOLOGY_DRAG_SETTLE_MOTION_CONTRACT,
  TOPOLOGY_RELATION_INSPECTOR_DURATION_MS,
  TOPOLOGY_RELATION_INSPECTOR_EASING_NAME,
  TOPOLOGY_RELATION_INSPECTOR_MOTION_CONTRACT,
  TOPOLOGY_CAMERA_EASING_NAME,
  TOPOLOGY_CAMERA_MOTION_CONTRACT,
  resolveSelectedFocusCameraMaxDistancePx,
  topologyCameraEaseOutQuart,
} from './motion-tokens';

describe('topology motion tokens', () => {
  it('names the selected focus camera contract explicitly', () => {
    expect(TOPOLOGY_CAMERA_MOTION_CONTRACT).toBe('purposeful-safe-fit-motion');
    expect(TOPOLOGY_CAMERA_EASING_NAME).toBe('ease-out-quart');
    expect(SELECTED_FOCUS_CAMERA_DURATION_MS).toBe(420);
    expect(SELECTED_FOCUS_CAMERA_DISTANCE_POLICY).toBe('bounded-safe-fit-distance');
    expect(SELECTED_FOCUS_CAMERA_NOOP_TRIGGER).toBe('selected-focus-already-safe');
    expect(SELECTED_FOCUS_CAMERA_NOOP_STATE).toBe('already-safe');
    expect(SELECTED_FOCUS_CAMERA_NOOP_TARGET_POLICY).toBe('already-inside-safe-rect');
    expect(SELECTED_FOCUS_CAMERA_NOOP_DISTANCE_POLICY).toBe('already-safe-no-motion');
  });

  it('bounds selected focus camera travel by fanout density', () => {
    expect(SELECTED_FOCUS_CAMERA_BASE_MAX_DISTANCE_PX).toBe(220);
    expect(SELECTED_FOCUS_CAMERA_FANOUT_ROW_DISTANCE_PX).toBe(16);
    expect(resolveSelectedFocusCameraMaxDistancePx(0)).toBe(220);
    expect(resolveSelectedFocusCameraMaxDistancePx(2)).toBe(220);
    expect(resolveSelectedFocusCameraMaxDistancePx(5)).toBe(268);
  });

  it('names the linked drag settle motion contract explicitly', () => {
    expect(TOPOLOGY_DRAG_SETTLE_MOTION_CONTRACT).toBe('linked-cluster-drag-settle');
    expect(TOPOLOGY_DRAG_SETTLE_DURATION_MS).toBe(720);
    expect(TOPOLOGY_DRAG_SETTLE_EASING_NAME).toBe('ease-out');
  });

  it('names the active relation inspector entry motion contract explicitly', () => {
    expect(TOPOLOGY_RELATION_INSPECTOR_MOTION_CONTRACT).toBe(
      'active-relation-inspector-entry',
    );
    expect(TOPOLOGY_RELATION_INSPECTOR_DURATION_MS).toBe(180);
    expect(TOPOLOGY_RELATION_INSPECTOR_EASING_NAME).toBe('ease-out');
  });

  it('uses an ease-out curve that starts fast and settles at the target', () => {
    expect(topologyCameraEaseOutQuart(0)).toBe(0);
    expect(topologyCameraEaseOutQuart(0.5)).toBeGreaterThan(0.9);
    expect(topologyCameraEaseOutQuart(1)).toBe(1);
  });
});
