import { invoke } from "@tauri-apps/api/core";
import type { UserSession } from "./auth";

export async function dbLoadWorkspace(): Promise<string | null> {
  return invoke<string | null>("db_load_workspace");
}

export async function dbSaveWorkspace(payload: string): Promise<void> {
  await invoke("db_save_workspace", { payload });
}

export async function dbLoadSession(): Promise<UserSession | null> {
  return invoke<UserSession | null>("db_load_session");
}

export async function dbSaveSession(session: UserSession): Promise<void> {
  await invoke("db_save_session", { session });
}

export async function dbClearSession(): Promise<void> {
  await invoke("db_clear_session");
}

export async function dbRegisterAccount(
  name: string,
  email: string,
  password: string,
): Promise<UserSession> {
  return invoke<UserSession>("db_register_account", { name, email, password });
}

export async function dbLoginAccount(email: string, password: string): Promise<UserSession> {
  return invoke<UserSession>("db_login_account", { email, password });
}

export async function dbGetDatabasePath(): Promise<string> {
  return invoke<string>("db_get_database_path");
}

export async function dbResetDatabase(): Promise<void> {
  await invoke("db_reset_database");
}
