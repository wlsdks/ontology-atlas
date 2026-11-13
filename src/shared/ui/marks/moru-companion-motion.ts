import source from './moru-companion.json';

/** Positions are fractions of the measured free space, never viewport coordinates. */
const itinerary = [
  ['wave', 0, 1], ['tail', 0.65, 1], ['hop', 1, 1], ['blink', 1, 1],
  ['tail', 0.25, -1], ['dance', 0.25, -1], ['hop', 0, -1], ['blink', 0, 1],
] as const;

export function companionMotion(travel: number, easing: string) {
  const duration = itinerary.reduce((sum, [id]) => sum + source.clips[id].durationsMs.reduce((a, b) => a + b, 0), 0);
  const sprite: Keyframe[] = [], movement: Keyframe[] = [], facing: Keyframe[] = [];
  let elapsed = 0, position = 0;
  for (const [id, destination, direction] of itinerary) {
    const clip = source.clips[id], offset = elapsed / duration;
    movement.push({ offset, transform: `translateX(${position * travel}px)`, easing });
    facing.push({ offset, transform: `scaleX(${direction})`, easing: 'steps(1, end)' });
    for (const [index, ms] of clip.durationsMs.entries()) {
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
