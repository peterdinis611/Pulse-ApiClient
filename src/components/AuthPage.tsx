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
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="size-3.5" />
          </div>
          <span className="text-[13px] font-semibold">{APP_NAME}</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-5 rounded-md border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback className="bg-primary text-sm text-primary-foreground">
                {previewInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                {mode === "login" ? "Welcome back" : "Create account"}
              </h1>
              <p className="text-[13px] text-muted-foreground">
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
            <TabsList className="grid h-8 w-full grid-cols-2 bg-transparent p-0">
              <TabsTrigger value="login" className="h-8">
                Login
              </TabsTrigger>
              <TabsTrigger value="register" className="h-8">
                Register
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
            {mode === "register" && (
              <div className="space-y-1.5">
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

            <div className="space-y-1.5">
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

            <div className="space-y-1.5">
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
              <div className="space-y-1.5">
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
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[13px] text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" /> : null}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="text-center text-[13px] text-muted-foreground">
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

          <p className="text-center text-[11px] text-muted-foreground">
            Local accounts and workspaces are stored on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
