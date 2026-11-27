import { NOT_FOUND_PICK, pickStandaloneMessages } from '@/i18n/standalone-messages';
import { NotFoundScreen } from '@/views/terminal-state';

const messages = pickStandaloneMessages(NOT_FOUND_PICK);

/** An address with no language Atlas knows: the screen carries its own words, in the window's language. */
export default function StandaloneNotFound() {
  return <NotFoundScreen standaloneMessages={messages} />;
}
