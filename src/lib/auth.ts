import {
  dbClearSession,
  dbLoadSession,
  dbLoginAccount,
  dbRegisterAccount,
  dbSaveSession,
  dbSwitchUser,
} from "./db-client";
import {
  toAuthError,
  validateLoginInput,
  validateRegistrationInput,
} from "./auth-errors";

export type { AuthErrorCode, AuthErrorField } from "./auth-errors";
export { AuthError, authErrorHint } from "./auth-errors";

export type UserSession = {
  id: string;
  name: string;
  email: string;
  initials: string;
  signedInAt: string;
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export async function loadUserSession(): Promise<UserSession | null> {
  try {
    return await dbLoadSession();
  } catch {
    return null;
  }
}

export async function saveUserSession(user: UserSession): Promise<void> {
  await dbSaveSession(user);
}

export async function clearUserSession(): Promise<void> {
  await dbClearSession();
}

export async function switchUserDatabase(userId: string | null): Promise<void> {
  await dbSwitchUser(userId);
}

export async function activateUserSession(user: UserSession): Promise<void> {
  await switchUserDatabase(user.id);
  await saveUserSession(user);
}

export async function signOutUser(): Promise<void> {
  await clearUserSession();
  await switchUserDatabase(null);
}

export async function registerAccount(
  name: string,
  email: string,
  password: string,
  confirmPassword: string,
): Promise<UserSession> {
  const validationError = validateRegistrationInput(name, email, password, confirmPassword);
  if (validationError) {
    throw validationError;
  }

  try {
    return await dbRegisterAccount(name.trim(), email.trim(), password);
  } catch (error) {
    throw toAuthError(error, "Could not create your account. Try again.");
  }
}

export async function loginAccount(email: string, password: string): Promise<UserSession> {
  const validationError = validateLoginInput(email, password);
  if (validationError) {
    throw validationError;
  }

  try {
    return await dbLoginAccount(email.trim(), password);
  } catch (error) {
    throw toAuthError(error, "Could not sign in. Check your email and password.");
  }
}
