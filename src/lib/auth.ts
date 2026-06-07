import {
  dbClearSession,
  dbLoadSession,
  dbLoginAccount,
  dbRegisterAccount,
  dbSaveSession,
} from "./db-client";

export type UserSession = {
  id: string;
  name: string;
  email: string;
  initials: string;
  signedInAt: string;
};

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

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

export async function registerAccount(
  name: string,
  email: string,
  password: string,
): Promise<UserSession> {
  try {
    return await dbRegisterAccount(name, email, password);
  } catch (error) {
    throw new AuthError(error instanceof Error ? error.message : "Registration failed.");
  }
}

export async function loginAccount(email: string, password: string): Promise<UserSession> {
  try {
    return await dbLoginAccount(email, password);
  } catch (error) {
    throw new AuthError(error instanceof Error ? error.message : "Login failed.");
  }
}
