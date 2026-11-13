import source from './moru-companion.json';

/** Invite a folder choice, then wait nearby. Only hops change floor position. */
const itinerary = [
  ['wave', 0, 1], ['hop', 1, 1], ['tilt', 1, 1], ['folder-open', 1, 1],
  ['blink', 1, 1], ['hop', 0, -1], ['folder-open', 0, 1], ['blink', 0, 1],
] as const;

function poseDurations(id: keyof typeof source.clips) {
  return source.clips[id].durationsMs.map((ms, frame, poses) => {
    if (id !== 'hop') return ms;
    // Retain the authored crouch/flight/landing poses; shorten only neutral dwell.
    return frame === 0 ? 180 : frame === poses.length - 1 ? 320 : ms;
  });
}

export function companionMotion(travel: number) {
  // A wide chooser must not turn a little hop into a room-wide glide.
  const reach = Math.min(Math.max(0, travel), source.cell / 4);
  const duration = itinerary.reduce((sum, [id]) => sum + poseDurations(id).reduce((a, b) => a + b, 0), 0);
  const sprite: Keyframe[] = [], movement: Keyframe[] = [], facing: Keyframe[] = [];
  let elapsed = 0, position = 0;
  for (const [id, destination, direction] of itinerary) {
    const clip = source.clips[id], durations = poseDurations(id), offset = elapsed / duration;
    movement.push({ offset, transform: `translateX(${position * reach}px)` });
    facing.push({ offset, transform: `scaleX(${direction})`, easing: 'steps(1, end)' });
    if (id === 'hop') {
      // Measured native cells: feet are planted through frame 5, airborne in 6–19,
      // and settled again in 20–23. Never translate the crouch or landing hold.
      const liftOff = durations.slice(0, 6).reduce((a, b) => a + b, 0);
      const landing = durations.slice(0, 20).reduce((a, b) => a + b, 0);
      movement.push(
        { offset: (elapsed + liftOff) / duration, transform: `translateX(${position * reach}px)` },
        { offset: (elapsed + landing) / duration, transform: `translateX(${destination * reach}px)` },
      );
    }
    for (const [index, ms] of durations.entries()) {
      sprite.push({ offset: elapsed / duration, transform: `translateX(${-(clip.firstFrame + index) * source.cell}px)`, easing: 'steps(1, end)' });
      elapsed += ms;
    }
    position = destination;
  }
  movement.push({ offset: 1, transform: 'translateX(0px)' });
  facing.push({ offset: 1, transform: 'scaleX(1)' });
  sprite.push({ offset: 1, transform: 'translateX(0px)' });
  return { duration, sprite, movement, facing };
}
