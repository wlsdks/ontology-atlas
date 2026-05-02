'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getUserAuthState,
  initializeUserAuthStore,
  subscribeUserAuth,
  type UserAuthState,
  type UserAuthStatus,
} from './session-store';

const SERVER_SNAPSHOT: UserAuthState = { status: 'loading', user: null };

function getServerSnapshot(): UserAuthState {
  return SERVER_SNAPSHOT;
}

export function useUserAuth(): UserAuthState {
  useEffect(() => {
    void initializeUserAuthStore();
  }, []);

  return useSyncExternalStore(subscribeUserAuth, getUserAuthState, getServerSnapshot);
}

export type { UserAuthState, UserAuthStatus };
