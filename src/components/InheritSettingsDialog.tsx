import { useEffect, useState } from "react";
import type { AuthConfig, Environment, FolderConfig, KeyValue } from "@/types";
import { defaultAuth } from "@/lib/helpers";
import { KeyValueEditor } from "@/components/KeyValueEditor";
import { VariableField } from "@/components/VariableField";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type InheritSettingsPatch = {
  auth: AuthConfig;
  variables: KeyValue[];
  preRequestScript: string;
  tests: string;
};

type InheritSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  allowInheritAuth: boolean;
  auth?: AuthConfig;
  variables?: KeyValue[];
  preRequestScript?: string;
  tests?: string;
  environment: Environment | null;
  onSave: (patch: InheritSettingsPatch) => void;
};

export function folderInheritDefaults(config?: FolderConfig): InheritSettingsPatch {
  return {
    auth: config?.auth ?? { ...defaultAuth(), authType: "inherit" },
    variables: config?.variables ?? [],
    preRequestScript: config?.preRequestScript ?? "",
    tests: config?.tests ?? "",
  };
}

export function InheritSettingsDialog({
  open,
  onOpenChange,
  title,
  allowInheritAuth,
  auth,
  variables,
  preRequestScript,
  tests,
  environment,
  onSave,
}: InheritSettingsDialogProps) {
  const [tab, setTab] = useState("auth");
  const [draftAuth, setDraftAuth] = useState<AuthConfig>(auth ?? defaultAuth());
  const [draftVars, setDraftVars] = useState<KeyValue[]>(variables ?? []);
  const [draftPre, setDraftPre] = useState(preRequestScript ?? "");
  const [draftTests, setDraftTests] = useState(tests ?? "");

  useEffect(() => {
    if (!open) return;
    setDraftAuth(auth ?? defaultAuth());
    setDraftVars(variables ?? []);
    setDraftPre(preRequestScript ?? "");
    setDraftTests(tests ?? "");
    setTab("auth");
  }, [open, auth, variables, preRequestScript, tests]);

  const patchAuth = (patch: Partial<AuthConfig>) => {
    setDraftAuth((current) => ({ ...current, ...patch }));
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            Requests set to Inherit pick up auth, variables, and scripts from this parent.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="auth">Auth</TabsTrigger>
            <TabsTrigger value="vars">Variables</TabsTrigger>
            <TabsTrigger value="pre">Pre-request</TabsTrigger>
            <TabsTrigger value="tests">Tests</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "auth" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Auth type</Label>
              <Select
                value={draftAuth.authType}
                onValueChange={(value) => patchAuth({ authType: value as AuthConfig["authType"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowInheritAuth && <SelectItem value="inherit">Inherit from parent</SelectItem>}
                  <SelectItem value="none">No Auth</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="apiKey">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draftAuth.authType === "bearer" && (
              <div className="space-y-2">
                <Label>Token</Label>
                <VariableField
                  environment={environment}
                  value={draftAuth.bearerToken}
                  onChange={(bearerToken) => patchAuth({ bearerToken })}
                  placeholder="{{token}}"
                />
              </div>
            )}
            {draftAuth.authType === "basic" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <VariableField
                    environment={environment}
                    value={draftAuth.basicUsername}
                    onChange={(basicUsername) => patchAuth({ basicUsername })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <VariableField
                    type="password"
                    environment={environment}
                    value={draftAuth.basicPassword}
                    onChange={(basicPassword) => patchAuth({ basicPassword })}
                  />
                </div>
              </div>
            )}
            {draftAuth.authType === "apiKey" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Key</Label>
                  <VariableField
                    environment={environment}
                    value={draftAuth.apiKeyKey}
                    onChange={(apiKeyKey) => patchAuth({ apiKeyKey })}
                    placeholder="X-API-Key"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Value</Label>
                  <VariableField
                    environment={environment}
                    value={draftAuth.apiKeyValue}
                    onChange={(apiKeyValue) => patchAuth({ apiKeyValue })}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "vars" && (
          <KeyValueEditor
            rows={draftVars}
            onChange={setDraftVars}
            environment={environment}
            showSecretToggle
            showInitial
          />
        )}

        {tab === "pre" && (
          <Textarea
            value={draftPre}
            onChange={(event) => setDraftPre(event.target.value)}
            className="min-h-[180px] font-mono text-[13px]"
            placeholder={'pulse.environment.set("token", "…");'}
          />
        )}

        {tab === "tests" && (
          <Textarea
            value={draftTests}
            onChange={(event) => setDraftTests(event.target.value)}
            className="min-h-[180px] font-mono text-[13px]"
            placeholder={
              'pulse.test("Status 200", function () {\n  pulse.response.to.have.status(200);\n});'
            }
          />
        )}

        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave({
                auth: draftAuth,
                variables: draftVars,
                preRequestScript: draftPre,
                tests: draftTests,
              });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
