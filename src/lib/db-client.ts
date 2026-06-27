import type { UserSession } from "./auth";
import { invokeEffect, invokeEffectVoid } from "./effect/tauri";
import { runEffect } from "./effect/run";

export async function dbLoadWorkspace(): Promise<string | null> {
  return runEffect(invokeEffect<string | null>("db_load_workspace"));
}

export async function dbSaveWorkspace(payload: string): Promise<void> {
  await runEffect(invokeEffectVoid("db_save_workspace", { payload }));
}

export async function dbLoadSession(): Promise<UserSession | null> {
  return runEffect(invokeEffect<UserSession | null>("db_load_session"));
}

export async function dbSaveSession(session: UserSession): Promise<void> {
  await runEffect(invokeEffectVoid("db_save_session", { session }));
}

export async function dbClearSession(): Promise<void> {
  await runEffect(invokeEffectVoid("db_clear_session"));
}

export async function dbRegisterAccount(
  name: string,
  email: string,
  password: string,
): Promise<UserSession> {
  return runEffect(invokeEffect<UserSession>("db_register_account", { name, email, password }));
}

export async function dbLoginAccount(email: string, password: string): Promise<UserSession> {
  return runEffect(invokeEffect<UserSession>("db_login_account", { email, password }));
}

export async function dbSwitchUser(userId: string | null): Promise<void> {
  await runEffect(invokeEffectVoid("db_switch_user", { userId }));
}

export async function dbGetDatabasePath(): Promise<string> {
  return runEffect(invokeEffect<string>("db_get_database_path"));
}

export async function dbResetDatabase(): Promise<void> {
  await runEffect(invokeEffectVoid("db_reset_database"));
}

export function dbLoadWorkspaceEffect() {
  return invokeEffect<string | null>("db_load_workspace");
}

export function dbLoadSessionEffect() {
  return invokeEffect<UserSession | null>("db_load_session");
}
