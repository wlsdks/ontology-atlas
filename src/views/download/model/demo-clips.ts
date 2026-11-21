/**
 * The demo clip registry. Whether footage exists is decided here in data, so with none attached
 * the section does not render (`.claude/rules/surfaces.md`). One clip, no captions, one take per
 * locale.
 */

export interface DemoClip {
  id: 'atlas-tour';
  seconds: number;
  basename: string;
  /**
   * Frame size of every take and poster, in px, measured with ffprobe. The video reserves this
   * shape before its poster arrives, or the section grows under the reader when it does.
   */
  width: number;
  height: number;
}

export const DEMO_CLIPS: readonly DemoClip[] = [
  { id: 'atlas-tour', seconds: 37, basename: 'atlas-tour', width: 1512, height: 868 },
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

function localeTag(locale: string): 'ko' | 'en' {
  return locale === 'ko' ? 'ko' : 'en';
}

/**
 * The webm's AV1 codec string (profile 0, level 5.1, Main tier, 8-bit; ffprobe `level=9`). Without
 * it an iPhone with no AV1 decoder answers "maybe" to bare `video/webm`, picks it and shows black.
 */
export const DEMO_WEBM_TYPE = 'video/webm; codecs="av01.0.09M.08"';

export function demoSources(clip: DemoClip, locale: string): { src: string; type: string }[] {
  const base = `/demo/${clip.basename}.${localeTag(locale)}`;
  return [
    { src: `${base}.webm`, type: DEMO_WEBM_TYPE },
    { src: `${base}.mp4`, type: 'video/mp4' },
  ];
}

export function demoPoster(clip: DemoClip, locale: string): string {
  return `/demo/${clip.basename}.${localeTag(locale)}-poster.webp`;
}
