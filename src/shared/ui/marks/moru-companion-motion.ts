import source from './moru-companion.json';
import { moruFrame } from './moru-frame';

/** Invite a folder choice, then wait nearby. Only hops change floor position. */
const folderItinerary = [
  ['wave', 0, 1], ['hop', 1, 1], ['tilt', 1, 1], ['folder-peek', 1, 1],
  ['blink', 1, 1], ['hop', 0, -1], ['folder-open', 0, 1], ['soft-bow', 0, 1], ['blink', 0, 1],
] as const;
const welcomeItinerary = [
  ['soft-bow', 0, 1], ['hop', 1, 1], ['tilt', 1, 1], ['blink', 1, 1],
  ['hop', 0, -1], ['wave', 0, 1], ['blink', 0, 1],
] as const;
const waitingItinerary = [['blink', 0, 1], ['tilt', 0, 1], ['blink', 0, 1]] as const;
export type CompanionContext = 'folder' | 'welcome' | 'waiting';

function poseDurations(id: keyof typeof source.clips) {
  return source.clips[id].durationsMs.map((ms, frame, poses) => {
    if (id !== 'hop') return ms;
    // Retain the authored crouch/flight/landing poses; shorten only neutral dwell.
    return frame === 0 ? 180 : frame === poses.length - 1 ? 320 : ms;
  });
}

export function companionMotion(travel: number, context: CompanionContext = 'folder') {
  const itinerary = context === 'folder' ? folderItinerary : context === 'waiting' ? waitingItinerary : welcomeItinerary;
  // A wide chooser must not turn a little hop into a room-wide glide.
  const reach = Math.min(Math.max(0, travel), source.cell / 4);
  const duration = itinerary.reduce((sum, [id]) => sum + poseDurations(id).reduce((a, b) => a + b, 0), 0);
  const sprite: Keyframe[] = [], movement: Keyframe[] = [], facing: Keyframe[] = [];
  const emote: Keyframe[] = [{ offset: 0, opacity: 0, transform: 'translateY(0px)' }];
  const phases: Array<{ start: number; end: number; firstHold: number; rest: number; liftOff: number | null }> = [];
  let elapsed = 0, position = 0;
  for (const [id, destination, direction] of itinerary) {
    const clip = source.clips[id], durations = poseDurations(id), offset = elapsed / duration;
    const end = elapsed + durations.reduce((a, b) => a + b, 0);
    phases.push({ start: elapsed, end, firstHold: durations[0], rest: end - durations[durations.length - 1],
      liftOff: id === 'hop' ? elapsed + durations.slice(0, 6).reduce((a, b) => a + b, 0) : null });
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
      // One small note on the return hop per itinerary, away from folder props.
      if (direction === -1) {
        const start = elapsed + liftOff, finish = Math.min(end - durations[durations.length - 1], start + 1600);
        emote.push(
          { offset: start / duration, opacity: 0, transform: 'translateY(0px)' },
          { offset: (start + 160) / duration, opacity: 1, transform: 'translateY(-2px)' },
          { offset: (finish - 240) / duration, opacity: 1, transform: 'translateY(-2px)' },
          { offset: finish / duration, opacity: 0, transform: 'translateY(-2px)' },
        );
      }
    }
    for (const [index, ms] of durations.entries()) {
      sprite.push({ offset: elapsed / duration, transform: moruFrame(clip.firstFrame + index, source), easing: 'steps(1, end)' });
      elapsed += ms;
    }
    position = destination;
  }
  movement.push({ offset: 1, transform: 'translateX(0px)' });
  facing.push({ offset: 1, transform: 'scaleX(1)' });
  sprite.push({ offset: 1, transform: moruFrame(0, source) });
  emote.push({ offset: 1, opacity: 0, transform: 'translateY(0px)' });
  return { duration, sprite, movement, facing, emote, restAt(time: number) {
    const cycle = Math.floor(time / duration) * duration, now = time - cycle;
    const phase = phases.find(item => now < item.end) ?? phases[0];
    if (now < phase.start + phase.firstHold || now >= phase.rest) return { at: time, delay: 0 };
    // A pet must not drop an airborne character to the floor. Let that hop land,
    // then use its neutral endpoint for the one-shot reaction and the return.
    if (phase.liftOff !== null && now >= phase.liftOff) return { at: cycle + phase.rest, delay: phase.rest - now };
    return { at: cycle + (phase.liftOff === null ? phase.rest : phase.start), delay: 0 };
  } };
}
