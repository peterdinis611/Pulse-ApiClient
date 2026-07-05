import { TauriInvokeError } from "@/lib/effect/errors";

export type AuthErrorCode =
  | "name_required"
  | "email_invalid"
  | "email_not_found"
  | "email_taken"
  | "password_too_short"
  | "password_mismatch"
  | "password_incorrect"
  | "credentials_required"
  | "unknown";

export type AuthErrorField = "name" | "email" | "password" | "confirmPassword";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly field?: AuthErrorField;

  constructor(message: string, options?: { code?: AuthErrorCode; field?: AuthErrorField }) {
    super(message);
    this.name = "AuthError";
    this.code = options?.code ?? inferAuthErrorCode(message);
    this.field = options?.field ?? inferAuthErrorField(this.code);
  }
}

const AUTH_MESSAGE_PATTERNS: Array<{ pattern: RegExp; code: AuthErrorCode }> = [
  { pattern: /full name/i, code: "name_required" },
  { pattern: /valid email/i, code: "email_invalid" },
  { pattern: /already exists/i, code: "email_taken" },
  { pattern: /no account found/i, code: "email_not_found" },
  { pattern: /incorrect password/i, code: "password_incorrect" },
  { pattern: /at least 6 characters/i, code: "password_too_short" },
  { pattern: /passwords do not match/i, code: "password_mismatch" },
  { pattern: /email and password/i, code: "credentials_required" },
];

export function inferAuthErrorCode(message: string): AuthErrorCode {
  const normalized = message.trim();
  if (!normalized) return "unknown";

  for (const entry of AUTH_MESSAGE_PATTERNS) {
    if (entry.pattern.test(normalized)) {
      return entry.code;
    }
  }

  return "unknown";
}

export function inferAuthErrorField(code: AuthErrorCode): AuthErrorField | undefined {
  switch (code) {
    case "name_required":
      return "name";
    case "email_invalid":
    case "email_not_found":
    case "email_taken":
      return "email";
    case "password_too_short":
    case "password_incorrect":
      return "password";
    case "password_mismatch":
      return "confirmPassword";
    case "credentials_required":
      return "email";
    default:
      return undefined;
  }
}

export function extractInvokeErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return cleanAuthMessage(error);
  if (error instanceof AuthError) return error.message;

  if (error instanceof TauriInvokeError) {
    return extractInvokeErrorMessage(error.cause);
  }

  if (typeof error === "object" && error !== null) {
    if ("_tag" in error && (error as { _tag: string })._tag === "TauriInvokeError" && "cause" in error) {
      return extractInvokeErrorMessage((error as { cause: unknown }).cause);
    }

    if ("cause" in error) {
      const nested = extractInvokeErrorMessage((error as { cause: unknown }).cause);
      if (nested) return nested;
    }

    if ("message" in error && typeof (error as { message: unknown }).message === "string") {
      const message = (error as { message: string }).message.trim();
      if (message && message !== "An error has occurred") {
        return cleanAuthMessage(message);
      }
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && message !== "An error has occurred") {
      return cleanAuthMessage(message);
    }
  }

  return "";
}

function cleanAuthMessage(raw: string): string {
  return raw
    .replace(/^\(FiberFailure\)\s*TauriInvokeError:\s*/i, "")
    .replace(/^(db_register_account|db_login_account):\s*/i, "")
    .trim();
}

export function toAuthError(error: unknown, fallback: string): AuthError {
  if (error instanceof AuthError) return error;

  const message = extractInvokeErrorMessage(error) || fallback;
  return new AuthError(message);
}

export function validateRegistrationInput(
  name: string,
  email: string,
  password: string,
  confirmPassword: string,
): AuthError | null {
  if (!name.trim()) {
    return new AuthError("Enter your full name.", { code: "name_required", field: "name" });
  }

  const normalizedEmail = email.trim();
  if (!normalizedEmail.includes("@") || !normalizedEmail.includes(".")) {
    return new AuthError("Enter a valid email address.", { code: "email_invalid", field: "email" });
  }

  if (password.length < 6) {
    return new AuthError("Password must be at least 6 characters.", {
      code: "password_too_short",
      field: "password",
    });
  }

  if (password !== confirmPassword) {
    return new AuthError("Passwords do not match.", { code: "password_mismatch", field: "confirmPassword" });
  }

  return null;
}

export function validateLoginInput(email: string, password: string): AuthError | null {
  if (!email.trim() || !password) {
    return new AuthError("Enter your email and password.", {
      code: "credentials_required",
      field: !email.trim() ? "email" : "password",
    });
  }

  return null;
}

export function authErrorHint(code: AuthErrorCode, mode: "login" | "register"): string | null {
  switch (code) {
    case "email_taken":
      return "An account with this email already exists. Try signing in instead.";
    case "email_not_found":
      return "No account uses this email. Check the address or create a new account.";
    case "password_incorrect":
      return "The password does not match this account. Try again or register a new account.";
    case "password_mismatch":
      return "Both password fields must match before you can create an account.";
    case "credentials_required":
      return mode === "login" ? "Email and password are required to sign in." : null;
    default:
      return null;
  }
}
