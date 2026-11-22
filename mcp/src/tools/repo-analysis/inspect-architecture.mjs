import {
  buildArchitectureBrief,
  buildArchitectureMeasuredStamp,
  findArchitectureProfiles,
} from '../../architecture/architecture-profile.mjs';
import { inferImports } from '../../infer-imports.mjs';
import { inspectProjectSource } from '../../project-source/project-source-inspection.mjs';
import { SERVER_VERSION } from '../../server-version.mjs';
import { REPO_ROOT, VAULT_ROOT, assertScanRootAllowed } from '../../server/runtime.mjs';
import { requireOptionalNonBlankString, requireOptionalPositiveInteger } from '../../server/validate.mjs';
import { loadVaultDocs } from '../../vault/documents/document-cache.mjs';
import { selectArchitectureProfile } from './architecture-profile-selection.mjs';

export function inspectArchitectureTool({ rootPath, profileSlug, maxFiles } = {}) {
  requireOptionalNonBlankString(rootPath, 'rootPath');
  requireOptionalNonBlankString(profileSlug, 'profileSlug');
  requireOptionalPositiveInteger(maxFiles, 'maxFiles', { max: 50000 });
  const target = rootPath ? assertScanRootAllowed(rootPath) : REPO_ROOT;
  const profiles = findArchitectureProfiles(loadVaultDocs(VAULT_ROOT));
  const profile = selectArchitectureProfile(profiles, profileSlug);
  const imports = inferImports(target, { maxFiles });
  // Measured stamp: when the scan ran, which tool version measured, and the exact
  // source state it saw.
  const measured = buildArchitectureMeasuredStamp(inspectProjectSource(target), {
    toolName: 'ontology-atlas',
    toolVersion: SERVER_VERSION,
  });
  return buildArchitectureBrief(
    profile,
    {
      ...imports,
      rootPath: target,
    },
    { measured },
  );
}
