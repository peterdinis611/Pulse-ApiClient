import { useRef } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { useApp } from "@/machines";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export function EnvironmentsView() {
  const {
    environments,
    activeEnvironmentId,
    setActiveEnvironmentId,
    updateEnvironment,
    deleteEnvironment,
    updateEnvironmentVariable,
    addEnvironmentVariable,
    removeEnvironmentVariable,
    exportEnvironments,
    importEnvironments,
  } = useApp();

  const importRef = useRef<HTMLInputElement>(null);

  return (
    <ScrollAreaWithTop className="h-full" resetKey="environments">
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Environments</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage variables and switch active environment for request substitution.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([exportEnvironments()], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "pulse-environments.json";
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download />
              Export
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
              <Upload />
              Import
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then(importEnvironments);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="max-w-xs space-y-2">
          <Label htmlFor="active-env">Active environment</Label>
          <Select
            value={activeEnvironmentId ?? undefined}
            onValueChange={(value) => setActiveEnvironmentId(value)}
          >
            <SelectTrigger id="active-env">
              <SelectValue placeholder="Select environment" />
            </SelectTrigger>
            <SelectContent>
              {environments.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  {env.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          {environments.map((env) => (
            <div key={env.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Input
                  value={env.name}
                  onChange={(event) => updateEnvironment(env.id, { name: event.target.value })}
                />
                {environments.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => deleteEnvironment(env.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>

              <div className="space-y-2 p-4">
                <div className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span>Variable</span>
                  <span>Value</span>
                  <span />
                </div>
                {env.variables.map((variable) => (
                  <div
                    key={variable.id}
                    className="grid grid-cols-[32px_1fr_1fr_32px] items-center gap-2"
                  >
                    <Checkbox
                      checked={variable.enabled}
                      onCheckedChange={(checked) =>
                        updateEnvironmentVariable(env.id, variable.id, {
                          enabled: checked === true,
                        })
                      }
                    />
                    <Input
                      value={variable.key}
                      placeholder="Variable"
                      onChange={(event) =>
                        updateEnvironmentVariable(env.id, variable.id, {
                          key: event.target.value,
                        })
                      }
                    />
                    <Input
                      value={variable.value}
                      placeholder="Value"
                      onChange={(event) =>
                        updateEnvironmentVariable(env.id, variable.id, {
                          value: event.target.value,
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => removeEnvironmentVariable(env.id, variable.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0"
                  onClick={() => addEnvironmentVariable(env.id)}
                >
                  + Add variable
                </Button>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Use {"{{variableName}}"} in URL, headers, auth, or body.
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollAreaWithTop>
  );
}
