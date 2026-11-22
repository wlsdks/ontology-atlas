import assert from 'node:assert/strict';
import test from 'node:test';

import { selectArchitectureProfile } from './architecture-profile-selection.mjs';

const profiles = [{ slug: 'architecture/web' }, { slug: 'architecture/api' }];

function refusal(profileList, profileSlug) {
  try {
    selectArchitectureProfile(profileList, profileSlug);
  } catch (error) {
    return error;
  }
  return null;
}

test('the only profile is chosen without naming it', () => {
  assert.equal(selectArchitectureProfile([profiles[0]], undefined), profiles[0]);
});

test('a named profile is chosen among several', () => {
  assert.equal(selectArchitectureProfile(profiles, 'architecture/api'), profiles[1]);
});

test('a vault with no profile is refused with the folder to add one under', () => {
  const error = refusal([], undefined);
  assert.deepEqual(error.repairFields, { errorCode: 'architecture_profile_missing', profileDirectory: 'architecture/' });
});

test('an unknown name is refused with the names that exist', () => {
  const error = refusal(profiles, 'architecture/none');
  assert.equal(error.message, 'Architecture profile not found: architecture/none.');
  assert.deepEqual(error.repairFields, {
    errorCode: 'architecture_profile_not_found',
    profileSlug: 'architecture/none',
    availableProfileSlugs: ['architecture/web', 'architecture/api'],
  });
});

test('several profiles and no name is refused instead of picking one', () => {
  const error = refusal(profiles, undefined);
  assert.equal(error.repairFields.errorCode, 'architecture_profile_required');
  assert.match(error.message, /Available profiles: architecture\/web, architecture\/api\.$/);
});
