'use client';

import type { User } from 'firebase/auth';
export {
  canUseDevAdminBypass,
  isDevAdminBypassActive,
  enableDevAdminBypass,
  disableDevAdminBypass,
} from '@/shared/lib/dev-admin-bypass';

export function getDevAdminUser(): User {
  return {
    uid: 'dev-admin-bypass',
    email: 'dev@local',
    displayName: 'Dev',
    emailVerified: true,
    isAnonymous: false,
    metadata: {} as User['metadata'],
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => '',
    getIdTokenResult: async () => ({}) as Awaited<ReturnType<User['getIdTokenResult']>>,
    reload: async () => {},
    toJSON: () => ({}),
    phoneNumber: null,
    photoURL: null,
    providerId: 'dev-bypass',
  } as User;
}
