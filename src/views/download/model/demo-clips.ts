/**
 * The demo clip registry (`docs/DECISIONS.md`, 2026-07-29 front-page demo video). Whether footage
 * exists is decided here in data, so with none attached the section does not render: a player
 * with nothing to play is dead UI (`.claude/rules/surfaces.md`). One clip, no captions, one take
 * per locale, since the text in the frame is localized.
 */

export interface DemoClip {
  id: 'atlas-tour';
  /** Measured with ffprobe; the post-shoot gate compares against it. */
  seconds: number;
  /** Filename stem in `public/demo/`; `.ko` / `.en` is appended. */
  basename: string;
}

/** Declared before filming, so the post-shoot gate has something to compare against. */
export const DEMO_CLIPS: readonly DemoClip[] = [
  { id: 'atlas-tour', seconds: 28, basename: 'atlas-tour' },
];

/**
 * Both the assets and this id must exist, so a half-uploaded asset never renders. The two locale
 * takes must stay distinct files (`demo-clip-assets.contract` compares bytes). A refilm replaces
 * the assets and `seconds` and rewrites `demoProvisionalNote`: the length has a gate, the sentence not.
 */
export const AVAILABLE_DEMO_CLIP_IDS: readonly DemoClip['id'][] = ['atlas-tour'];

export function availableDemoClips(
  available: readonly DemoClip['id'][] = AVAILABLE_DEMO_CLIP_IDS,
): readonly DemoClip[] {
  return DEMO_CLIPS.filter((clip) => available.includes(clip.id));
}

export function hasDemoClips(
  available: readonly DemoClip['id'][] = AVAILABLE_DEMO_CLIP_IDS,
): boolean {
  return availableDemoClips(available).length > 0;
}

function localeTag(locale: string): 'ko' | 'en' {
  return locale === 'ko' ? 'ko' : 'en';
}

/** AV1 webm first with an MP4 fallback: Safari's AV1 depends on hardware. */
export function demoSources(clip: DemoClip, locale: string): { src: string; type: string }[] {
  const base = `/demo/${clip.basename}.${localeTag(locale)}`;
  return [
    { src: `${base}.webm`, type: 'video/webm' },
    { src: `${base}.mp4`, type: 'video/mp4' },
  ];
}

export function demoPoster(clip: DemoClip, locale: string): string {
  return `/demo/${clip.basename}.${localeTag(locale)}-poster.png`;
}
