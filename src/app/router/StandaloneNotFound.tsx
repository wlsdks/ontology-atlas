import { NOT_FOUND_MESSAGES } from '@/i18n/not-found-messages';
import { NotFoundScreen } from '@/views/terminal-state';

import { BootPictureRemover } from './BootPictureRemover';

/** An address with no language Atlas knows: the screen carries its own words, in the window's language. */
export default function StandaloneNotFound() {
  return (
    <>
      <BootPictureRemover />
      <NotFoundScreen standaloneMessages={NOT_FOUND_MESSAGES} />
    </>
  );
}
