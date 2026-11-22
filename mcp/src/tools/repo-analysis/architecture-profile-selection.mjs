/**
 * The profile an inspection runs against: the one named by `profileSlug`, or the only
 * one the vault holds. Refuses with a repair hint when there is none, the name is
 * unknown, or several exist and none was named.
 */
export function selectArchitectureProfile(profiles, profileSlug) {
  if (profiles.length === 0) {
    const error = new Error(
      'No architecture-profile/v1 document exists in the active vault. Add a reviewed Markdown profile under architecture/ before inspecting source conformance.',
    );
    error.repairFields = {
      errorCode: 'architecture_profile_missing',
      profileDirectory: 'architecture/',
    };
    throw error;
  }
  let profile = null;
  if (profileSlug !== undefined) {
    profile = profiles.find((candidate) => candidate.slug === profileSlug) ?? null;
    if (!profile) {
      const error = new Error(`Architecture profile not found: ${profileSlug}.`);
      error.repairFields = {
        errorCode: 'architecture_profile_not_found',
        profileSlug,
        availableProfileSlugs: profiles.map((candidate) => candidate.slug),
      };
      throw error;
    }
  } else if (profiles.length === 1) {
    [profile] = profiles;
  } else {
    const error = new Error(
      `Multiple architecture profiles exist; pass profileSlug. Available profiles: ${profiles.map((candidate) => candidate.slug).join(', ')}.`,
    );
    error.repairFields = {
      errorCode: 'architecture_profile_required',
      availableProfileSlugs: profiles.map((candidate) => candidate.slug),
    };
    throw error;
  }
  return profile;
}
