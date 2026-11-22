/**
 * The single source for the external links the gateway chrome renders.
 *
 * An empty value renders its slot disabled, with `aria-disabled` and a tooltip saying why;
 * filling it in makes a real link without touching the component. This is only for an account
 * that exists: a disabled slot must never stand in for "coming soon".
 */

/**
 * The X handle, without the `@`; empty renders disabled. Only the handle, never a full URL, so
 * a domain change does not touch this file.
 */
export const X_HANDLE = 'stark9777';

export function xProfileUrl(): string | null {
  return X_HANDLE ? `https://x.com/${X_HANDLE}` : null;
}

/** The maker's LinkedIn profile: the page's direct line to the person behind it. */
export const MAKER_LINKEDIN_URL = 'https://www.linkedin.com/in/writedev/';

export const GITHUB_REPO_URL = 'https://github.com/wlsdks/ontology-atlas';
