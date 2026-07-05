import { useState } from "react";
import { LoaderCircle, Send, Shield, Zap } from "lucide-react";
import { useApp } from "@/machines";
import {
  authErrorHint,
  AuthError,
  activateUserSession,
  getInitials,
  loginAccount,
  registerAccount,
  type AuthErrorField,
} from "@/lib/auth";
import { loadPersistedState } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { APP_NAME } from "@/lib/app-config";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "register";

type FieldErrors = Partial<Record<AuthErrorField, string>>;

const FEATURES = [
  { icon: Send, text: "Send HTTP, GraphQL, and WebSocket requests" },
  { icon: Shield, text: "Local-first workspaces stored on your device" },
];

export function AuthPage() {
  const { signIn } = useApp();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const previewInitials = mode === "register" && name.trim() ? getInitials(name) : "PD";

  const resetErrors = () => {
    setError(null);
    setErrorHint(null);
    setFieldErrors({});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetErrors();
    setLoading(true);

    try {
      const user =
        mode === "register"
          ? await registerAccount(name, email, password, confirmPassword)
          : await loginAccount(email, password);
      await activateUserSession(user);
      const persisted = await loadPersistedState();
      signIn(user, persisted);
    } catch (caught) {
      const authError = caught instanceof AuthError ? caught : new AuthError("Something went wrong.");
      setError(authError.message);
      setErrorHint(authErrorHint(authError.code, mode));
      if (authError.field) {
        setFieldErrors({ [authError.field]: authError.message });
      }
      toast.error(mode === "login" ? "Sign in failed" : "Registration failed", authError.message);
    } finally {
      setLoading(false);
    }
  };

  const fieldErrorClass = (field: AuthErrorField) =>
    cn(fieldErrors[field] && "border-destructive focus-visible:ring-destructive/30");

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="auth-brand-panel hidden w-[42%] max-w-xl flex-col justify-between border-r border-rail-border p-8 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Zap className="size-4" />
          </div>
          <span className="text-title">{APP_NAME}</span>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Your API workspace, locally.
            </h1>
            <p className="max-w-sm text-body text-muted-foreground">
              Collections, environments, history, and tests — all in one fast desktop client.
            </p>
          </div>
          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-body text-muted-foreground">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card/60">
                  <Icon className="size-3.5 text-primary" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-caption normal-case tracking-normal text-rail-foreground">
          Data stays on this device
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="view-header flex h-11 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Zap className="size-3.5" />
            </div>
            <span className="text-body font-semibold">{APP_NAME}</span>
          </div>
          <div className="hidden lg:block" />
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center justify-center px-4 py-8 lg:px-8">
          <div className="ui-panel w-full max-w-md p-6">
            <div className="mb-5 flex items-center gap-3">
              <Avatar className="size-11">
                <AvatarFallback className="bg-primary text-sm text-primary-foreground">
                  {previewInitials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-title">
                  {mode === "login" ? "Welcome back" : "Create account"}
                </h2>
                <p className="text-body text-muted-foreground">
                  {mode === "login"
                    ? "Sign in to open your workspace."
                    : "Register to get started."}
                </p>
              </div>
            </div>

            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as AuthMode);
                resetErrors();
              }}
            >
              <TabsList className="mb-4 grid h-9 w-full grid-cols-2 bg-surface-1/80 p-1">
                <TabsTrigger value="login" className="h-7 rounded-md data-[state=active]:shadow-sm">
                  Login
                </TabsTrigger>
                <TabsTrigger value="register" className="h-7 rounded-md data-[state=active]:shadow-sm">
                  Register
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form className="space-y-3.5" onSubmit={(event) => void handleSubmit(event)}>
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="register-name">Full name</Label>
                  <Input
                    id="register-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (fieldErrors.name) resetErrors();
                    }}
                    placeholder="Peter Dinis"
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.name)}
                    className={fieldErrorClass("name")}
                  />
                  {fieldErrors.name && (
                    <p className="text-[12px] text-destructive">{fieldErrors.name}</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (fieldErrors.email) resetErrors();
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={fieldErrorClass("email")}
                />
                {fieldErrors.email && (
                  <p className="text-[12px] text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <PasswordInput
                  id="auth-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (fieldErrors.password) resetErrors();
                  }}
                  placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                  aria-invalid={Boolean(fieldErrors.password)}
                  className={fieldErrorClass("password")}
                />
                {fieldErrors.password && (
                  <p className="text-[12px] text-destructive">{fieldErrors.password}</p>
                )}
              </div>

              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-confirm-password">Confirm password</Label>
                  <PasswordInput
                    id="auth-confirm-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      if (fieldErrors.confirmPassword) resetErrors();
                    }}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    required
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    className={fieldErrorClass("confirmPassword")}
                  />
                  {fieldErrors.confirmPassword && (
                    <p className="text-[12px] text-destructive">{fieldErrors.confirmPassword}</p>
                  )}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-body text-destructive"
                >
                  <p className="font-medium">{error}</p>
                  {errorHint && <p className="mt-1 text-[12px] text-destructive/90">{errorHint}</p>}
                </div>
              )}

              <Button type="submit" className="h-9 w-full" disabled={loading}>
                {loading ? <LoaderCircle className="animate-spin" /> : null}
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <p className="mt-4 text-center text-body text-muted-foreground">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  resetErrors();
                }}
              >
                {mode === "login" ? "Register" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
