const STORAGE_KEY = 'dev-admin-bypass';

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function canUseDevAdminBypass(): boolean {
  if (typeof window === 'undefined') return false;
  return process.env.NEXT_PUBLIC_DEV_ADMIN_BYPASS !== '0' && isLocalHost(window.location.hostname);
}

export function isDevAdminBypassActive(): boolean {
  if (!canUseDevAdminBypass()) return false;
  return window.sessionStorage.getItem(STORAGE_KEY) === '1';
}

export function enableDevAdminBypass(): void {
  if (!canUseDevAdminBypass()) return;
  window.sessionStorage.setItem(STORAGE_KEY, '1');
}

export function disableDevAdminBypass(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
