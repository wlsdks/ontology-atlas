export {
  changePassword,
  getPasswordSupportState,
  getCurrentAuthProfile,
  sendPasswordReset,
  signInWithDemo,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
} from './auth-service';
export type { PasswordSupportState } from './auth-service';
export { useUserAuth, type UserAuthState, type UserAuthStatus } from './use-user-auth';
