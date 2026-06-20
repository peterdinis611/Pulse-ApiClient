import { useState } from "react";
import { LoaderCircle, Zap } from "lucide-react";
import { useApp } from "@/machines";
import { AuthError, activateUserSession, getInitials, loginAccount, registerAccount } from "@/lib/auth";
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

export function AuthPage() {
  const { signIn } = useApp();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const previewInitials = mode === "register" && name.trim() ? getInitials(name) : "PD";

  const resetErrors = () => setError(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetErrors();
    setLoading(true);

    try {
      if (mode === "register") {
        if (password !== confirmPassword) {
          throw new AuthError("Passwords do not match.");
        }
      }

      const user =
        mode === "register"
          ? await registerAccount(name, email, password)
          : await loginAccount(email, password);
      await activateUserSession(user);
      const persisted = await loadPersistedState();
      signIn(user, persisted);
    } catch (caught) {
      const message = caught instanceof AuthError ? caught.message : "Something went wrong.";
      setError(message);
      toast.error(mode === "login" ? "Sign in failed" : "Registration failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <section className="hidden w-[42%] flex-col justify-between border-r border-border bg-topbar p-10 text-topbar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-5" />
          </div>
          <div>
            <p className="text-lg font-semibold">{APP_NAME}</p>
            <p className="text-sm text-topbar-muted">API Client</p>
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">Build and test APIs faster.</h1>
          <p className="max-w-md text-sm leading-relaxed text-topbar-muted">
            Collections, environments, GraphQL, tests, and concurrent requests — all in one desktop
            workspace.
          </p>
        </div>

        <p className="text-xs text-topbar-muted">
          Local accounts and per-user workspaces are stored on this device.
        </p>
      </section>

      <section className="flex min-h-screen flex-1 flex-col">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Zap className="size-4" />
            </div>
            <span className="font-semibold">{APP_NAME}</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="w-full max-w-md space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="size-14">
                <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                  {previewInitials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {mode === "login" ? "Welcome back" : "Create account"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {mode === "login"
                    ? "Sign in to open your API workspace."
                    : "Register to start using the client."}
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
              <TabsList className="grid h-10 w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
            </Tabs>

            <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="register-name">Full name</Label>
                  <Input
                    id="register-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Peter Dinis"
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-password">Password</Label>
                <PasswordInput
                  id="auth-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                />
              </div>

              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="auth-confirm-password">Confirm password</Label>
                  <PasswordInput
                    id="auth-confirm-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <LoaderCircle className="animate-spin" /> : null}
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                className={cn("font-medium text-foreground underline-offset-4 hover:underline")}
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
      </section>
    </div>
  );
}
