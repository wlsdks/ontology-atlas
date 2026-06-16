import { describe, expect, it } from 'vitest';
import {
  SELECTED_FOCUS_CAMERA_DURATION_MS,
  TOPOLOGY_CAMERA_EASING_NAME,
  TOPOLOGY_CAMERA_MOTION_CONTRACT,
  topologyCameraEaseOutQuart,
} from './motion-tokens';

describe('topology motion tokens', () => {
  it('names the selected focus camera contract explicitly', () => {
    expect(TOPOLOGY_CAMERA_MOTION_CONTRACT).toBe('purposeful-safe-fit-motion');
    expect(TOPOLOGY_CAMERA_EASING_NAME).toBe('ease-out-quart');
    expect(SELECTED_FOCUS_CAMERA_DURATION_MS).toBe(420);
  });

  it('uses an ease-out curve that starts fast and settles at the target', () => {
    expect(topologyCameraEaseOutQuart(0)).toBe(0);
    expect(topologyCameraEaseOutQuart(0.5)).toBeGreaterThan(0.9);
    expect(topologyCameraEaseOutQuart(1)).toBe(1);
  });
});
