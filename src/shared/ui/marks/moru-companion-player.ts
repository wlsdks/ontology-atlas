import reactions from './moru-reactions.json';
import { companionMotion, type CompanionContext } from './moru-companion-motion';
import { moruFrame } from './moru-frame';

const gestures = ['shy', 'clap', 'dance', 'thinking', 'pondering', 'hearts', 'laugh', 'flipper-groove', 'soft-bow', 'flipper-five', 'hat-tip', 'magic-fish'] as const;

/** A local, finite response to touch; it never projects agent or folder status. */
export function companionPlayer({ image, reactionImage, body, bubble, bounds, animations, context, reducedMotion, intent }: {
  image: HTMLImageElement; reactionImage: HTMLImageElement; body: HTMLButtonElement; bounds: HTMLElement;
  bubble: HTMLSpanElement; animations: Animation[]; context: CompanionContext; reducedMotion: boolean;
  intent: () => { paused: boolean; held: boolean };
}) {
  let motion = companionMotion(Math.max(0, bounds.clientWidth - reactions.cell), context);
  let visible = false, disposed = false, nextGesture = 0, requested: typeof gestures[number] | null = null;
  let reaction: Animation | null = null, timer: ReturnType<typeof setTimeout> | null = null, still = false;
  let emotion: Animation | null = null;
  let reactionReady = typeof reactionImage.decode !== 'function', decodeFailed = false;
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const showAmbient = () => {
    image.hidden = false; reactionImage.hidden = true; still = false;
    delete body.dataset.moruReaction;
    delete bubble.dataset.emotion; bubble.style.opacity = '0';
  };
  const cancelReaction = () => {
    clearTimer(); requested = null;
    if (reaction) { reaction.onfinish = null; reaction.cancel(); reaction = null; }
    emotion?.cancel(); emotion = null;
    showAmbient();
  };
  const pauseAmbient = () => { for (const animation of animations) animation.pause(); };
  const playAmbient = () => { for (const animation of animations) animation.play(); };
  const showEmotion = (id: typeof gestures[number], animated: boolean, duration = 0) => {
    if (context === 'waiting') return;
    // The still fish is already an expression; keep its prop space clear.
    if (id === 'magic-fish' && !animated) {
      delete bubble.dataset.emotion; bubble.style.opacity = '0';
      return;
    }
    bubble.dataset.emotion = ['dance', 'flipper-groove'].includes(id) ? 'note' : ['clap', 'hat-tip', 'magic-fish'].includes(id) ? 'spark' : 'heart';
    // A still response overrides the paused ambient keyframe without creating
    // an animation under reduced motion or resuming an explicit pause.
    if (!animated) { bubble.style.setProperty('opacity', '1', 'important'); return; }
    // The magic bubble settles before the fish appears above the head.
    const emotionDuration = id === 'magic-fish' ? 720 : duration;
    emotion = bubble.animate([
      { opacity: 0, transform: 'translateY(0px)', offset: 0 },
      { opacity: 1, transform: 'translateY(-2px)', offset: 0.08 },
      { opacity: 1, transform: 'translateY(-2px)', offset: 0.72 },
      { opacity: 0, transform: 'translateY(-2px)', offset: 0.9 },
      { opacity: 0, transform: 'translateY(-2px)', offset: 1 },
    ], { duration: emotionDuration, fill: 'both' });
  };
  const begin = (id: typeof gestures[number], at: number) => {
    requested = null;
    pauseAmbient();
    for (const animation of animations) animation.currentTime = at;
    const clip = reactions.clips[id];
    // A response starts promptly and settles, keeping the authored middle poses.
    const durations = clip.durationsMs.map((ms, i, all) => i === 0 ? 120 : i === all.length - 1 ? 240 : ms);
    const duration = durations.reduce((a, b) => a + b, 0);
    let elapsed = 0;
    const frames = durations.map((ms, i) => {
      const frame = { offset: elapsed / duration, transform: moruFrame(clip.firstFrame + i, reactions), easing: 'steps(1, end)' };
      elapsed += ms;
      return frame;
    });
    frames.push({ offset: 1, transform: moruFrame(clip.firstFrame + durations.length - 1, reactions), easing: 'steps(1, end)' });
    image.hidden = true; reactionImage.hidden = false;
    body.dataset.moruReaction = id;
    showEmotion(id, true, duration);
    reaction = reactionImage.animate(frames, { duration, fill: 'both' });
    reaction.onfinish = () => { cancelReaction(); update(); };
  };
  const update = () => {
    clearTimer();
    if (disposed || reducedMotion || animations.length === 0) return;
    const { paused, held } = intent();
    const onScreen = visible && !document.hidden;
    if (still && !paused) showAmbient();
    if (reaction) {
      pauseAmbient();
      if (onScreen && !paused) reaction.play(); else reaction.pause();
      // A finished short bubble must not restart when the longer fish gesture
      // regains visibility or pointer attention changes.
      if (emotion && emotion.playState !== 'finished') {
        if (onScreen && !paused) emotion.play(); else emotion.pause();
      }
    } else if (requested && reactionReady && onScreen && !paused) {
      const rest = motion.restAt(Number(animations[0].currentTime ?? 0));
      if (rest.delay > 0) {
        // Finish the airborne hop even when the pointer now holds the actor.
        playAmbient();
        timer = setTimeout(() => { timer = null; if (!disposed && requested) begin(requested, rest.at); }, rest.delay);
      } else begin(requested, rest.at);
    } else if (onScreen && !paused && held) {
      const rest = motion.restAt(Number(animations[0].currentTime ?? 0));
      if (rest.delay > 0) {
        // Attention is a grounded rest, not a freeze in the air. Explicit pause
        // and hidden-document handling still stop immediately via the branches below.
        playAmbient();
        timer = setTimeout(() => {
          timer = null;
          if (disposed) return;
          for (const animation of animations) animation.currentTime = rest.at;
          pauseAmbient();
        }, rest.delay);
      } else pauseAmbient();
    } else if (onScreen && !paused) playAmbient(); else pauseAmbient();
  };
  const respond = (id: typeof gestures[number]) => {
    if (reducedMotion || intent().paused || animations.length === 0) {
      // Explicit pause/reduced motion permits a changed expression, never motion.
      pauseAmbient(); still = true;
      if (animations.length) {
        const rest = motion.restAt(Number(animations[0].currentTime ?? 0));
        // A paused airborne pose stays paused; do not teleport it to the floor.
        if (rest.delay > 0) return;
        for (const animation of animations) animation.currentTime = rest.at;
      }
      image.hidden = true; reactionImage.hidden = false;
      const clip = reactions.clips[id];
      reactionImage.style.transform = moruFrame(clip.firstFrame + Math.floor(clip.durationsMs.length / 2), reactions);
      body.dataset.moruReaction = id;
      showEmotion(id, false);
    } else { requested = id; update(); }
  };
  // WebKit can postpone decoding a hidden strip until its first use. Keep the
  // ambient image visible until the replacement is ready, including still feedback.
  if (!reactionReady) void reactionImage.decode().then(() => {
    if (disposed) return;
    reactionReady = true;
    if (requested) { const id = requested; requested = null; respond(id); }
  }, () => {
    if (disposed) return;
    decodeFailed = true; requested = null; update();
  });
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting === true; update();
  });
  observer?.observe(bounds);
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    motion = companionMotion(Math.max(0, bounds.clientWidth - reactions.cell), context);
    (animations[1]?.effect as KeyframeEffect | null)?.setKeyframes(motion.movement);
  });
  resize?.observe(bounds);
  document.addEventListener('visibilitychange', update);
  update();

  return {
    update,
    react() {
      if (disposed || decodeFailed || reaction || requested) return;
      const available = context === 'waiting' ? ['soft-bow', 'thinking'] as const : context === 'folder' ? gestures.slice(0, -1) : gestures;
      const id = available[nextGesture++ % available.length];
      if (!reactionReady) { requested = id; return; }
      respond(id);
    },
    destroy() {
      disposed = true; cancelReaction();
      observer?.disconnect(); resize?.disconnect();
      document.removeEventListener('visibilitychange', update);
      for (const animation of animations) animation.cancel();
    },
  };
}
