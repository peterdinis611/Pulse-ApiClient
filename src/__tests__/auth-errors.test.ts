import { describe, expect, it } from "vitest";
import { TauriInvokeError } from "@/lib/effect/errors";
import {
  AuthError,
  authErrorHint,
  extractInvokeErrorMessage,
  inferAuthErrorCode,
  toAuthError,
  validateLoginInput,
  validateRegistrationInput,
} from "@/lib/auth-errors";

describe("auth errors", () => {
  it("extracts plain invoke strings", () => {
    expect(extractInvokeErrorMessage("Incorrect password.")).toBe("Incorrect password.");
  });

  it("extracts nested tauri invoke errors", () => {
    const error = new TauriInvokeError({
      command: "db_login_account",
      cause: "No account found for this email.",
    });

    expect(extractInvokeErrorMessage(error)).toBe("No account found for this email.");
  });

  it("maps backend messages to auth error codes", () => {
    expect(inferAuthErrorCode("An account with this email already exists.")).toBe("email_taken");
    expect(inferAuthErrorCode("Password must be at least 6 characters.")).toBe("password_too_short");
  });

  it("validates registration input before ipc", () => {
    expect(validateRegistrationInput("", "user@example.com", "secret1", "secret1")?.code).toBe(
      "name_required",
    );
    expect(validateRegistrationInput("Peter", "bad-email", "secret1", "secret1")?.code).toBe(
      "email_invalid",
    );
    expect(validateRegistrationInput("Peter", "user@example.com", "short", "short")?.code).toBe(
      "password_too_short",
    );
    expect(validateRegistrationInput("Peter", "user@example.com", "secret1", "secret2")?.code).toBe(
      "password_mismatch",
    );
  });

  it("validates login input before ipc", () => {
    expect(validateLoginInput("", "secret")?.field).toBe("email");
    expect(validateLoginInput("user@example.com", "")?.field).toBe("password");
  });

  it("wraps unknown failures with fallback copy", () => {
    const error = toAuthError(new Error("An error has occurred"), "Could not sign in.");
    expect(error).toBeInstanceOf(AuthError);
    expect(error.message).toBe("Could not sign in.");
  });

  it("returns helpful hints for common auth failures", () => {
    expect(authErrorHint("email_taken", "register")).toContain("signing in");
    expect(authErrorHint("password_incorrect", "login")).toContain("password");
  });
});
