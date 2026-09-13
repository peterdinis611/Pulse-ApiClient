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
import { useT } from "@/hooks/useLocale";
import type { MessageKey } from "@/lib/i18n";

type AuthMode = "login" | "register";

type FieldErrors = Partial<Record<AuthErrorField, string>>;

const FEATURES: Array<{ icon: typeof Send; textKey: MessageKey }> = [
  { icon: Send, textKey: "auth.feature.http" },
  { icon: Shield, textKey: "auth.feature.local" },
];

export function AuthPage() {
  const { signIn } = useApp();
  const t = useT();
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
      toast.error(mode === "login" ? t("auth.signInFailed") : t("auth.registerFailed"), authError.message);
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
              {t("auth.headline")}
            </h1>
            <p className="max-w-sm text-body text-muted-foreground">
              {t("auth.subhead")}
            </p>
          </div>
          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, textKey }) => (
              <li key={textKey} className="flex items-center gap-3 text-body text-muted-foreground">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card/60">
                  <Icon className="size-3.5 text-primary" />
                </span>
                {t(textKey)}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-caption normal-case tracking-normal text-rail-foreground">
          {t("auth.stays")}
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
                  {mode === "login" ? t("auth.welcome") : t("auth.create")}
                </h2>
                <p className="text-body text-muted-foreground">
                  {mode === "login" ? t("auth.signInLead") : t("auth.registerLead")}
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
                  {t("auth.login")}
                </TabsTrigger>
                <TabsTrigger value="register" className="h-7 rounded-md data-[state=active]:shadow-sm">
                  {t("auth.register")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form className="space-y-3.5" onSubmit={(event) => void handleSubmit(event)}>
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="register-name">{t("auth.fullName")}</Label>
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
                <Label htmlFor="auth-email">{t("auth.email")}</Label>
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
                <Label htmlFor="auth-password">{t("auth.password")}</Label>
                <PasswordInput
                  id="auth-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (fieldErrors.password) resetErrors();
                  }}
                  placeholder={mode === "register" ? t("auth.passwordNewPlaceholder") : t("auth.passwordPlaceholder")}
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
                  <Label htmlFor="auth-confirm-password">{t("auth.confirmPassword")}</Label>
                  <PasswordInput
                    id="auth-confirm-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      if (fieldErrors.confirmPassword) resetErrors();
                    }}
                    placeholder={t("auth.confirmPlaceholder")}
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
                {mode === "login" ? t("auth.signIn") : t("auth.createAccount")}
              </Button>
            </form>

            <p className="mt-4 text-center text-body text-muted-foreground">
              {mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  resetErrors();
                }}
              >
                {mode === "login" ? t("auth.register") : t("auth.signIn")}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
