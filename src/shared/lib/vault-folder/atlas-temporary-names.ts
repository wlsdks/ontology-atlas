/**
 * The names Atlas's writers give a file while it is being written, recognised as
 * `src-tauri/src/temporary_names.rs` recognises them: only a whole name in one of the writers'
 * exact shapes, never a person's file that mentions the marker. Both read
 * `tests/fixtures/atlas-temporary-names.json` in their tests.
 */

const TEMPORARY_MARKER = '.oatlas-tmp-';
const CREATE_PREFIX = '.oatlas-create-';
const CREATE_SUFFIX = '.tmp';

const DIGITS = /^[0-9]+$/;
const PID_HEX_HEX = /^[0-9]+-[0-9a-f]+-[0-9a-f]+$/;
const PID_UUID = /^[0-9]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isAtlasTemporaryName(name: string): boolean {
  if (name.startsWith(CREATE_PREFIX) && name.endsWith(CREATE_SUFFIX)) {
    const middle = name.slice(CREATE_PREFIX.length, name.length - CREATE_SUFFIX.length);
    if (name.length >= CREATE_PREFIX.length + CREATE_SUFFIX.length) return PID_HEX_HEX.test(middle);
  }
  const at = name.lastIndexOf(TEMPORARY_MARKER);
  if (at < 0) return false;
  const target = name.slice(0, at);
  const suffix = name.slice(at + TEMPORARY_MARKER.length);
  if (DIGITS.test(suffix)) return target.length > 0;
  return target.length > 1 && target.startsWith('.') && (PID_HEX_HEX.test(suffix) || PID_UUID.test(suffix));
}
