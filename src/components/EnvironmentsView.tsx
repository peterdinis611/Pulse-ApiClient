import { useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { useApp } from "@/machines";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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
    addEnvironment,
  } = useApp();

  const importRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState(
    () => activeEnvironmentId ?? environments[0]?.id ?? "",
  );

  const selectedEnv =
    environments.find((env) => env.id === selectedId) ?? environments[0] ?? null;

  return (
    <ScrollAreaWithTop className="h-full" resetKey="environments">
      <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Environments</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Define variables per environment. Use {"{{variableName}}"} in URLs, headers, auth, and
              bodies. Set a workspace default or override per request tab.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addEnvironment}>
              <Plus />
              New
            </Button>
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

        <div className="flex flex-wrap gap-2">
          {environments.map((env) => {
            const active = env.id === activeEnvironmentId;
            const selected = env.id === selectedEnv?.id;
            return (
              <button
                key={env.id}
                type="button"
                onClick={() => setSelectedId(env.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  selected
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="font-medium">{env.name}</span>
                {active && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                    Default
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedEnv && (
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-muted/30 px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Input
                  className="max-w-xs border-transparent bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                  value={selectedEnv.name}
                  onChange={(event) => updateEnvironment(selectedEnv.id, { name: event.target.value })}
                />
                <Button
                  type="button"
                  variant={activeEnvironmentId === selectedEnv.id ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setActiveEnvironmentId(selectedEnv.id)}
                >
                  {activeEnvironmentId === selectedEnv.id ? "Workspace default" : "Set as default"}
                </Button>
              </div>
              {environments.length > 1 && (
                <TooltipIconButton
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  label="Delete environment"
                  onClick={() => {
                    deleteEnvironment(selectedEnv.id);
                    const next = environments.find((env) => env.id !== selectedEnv.id);
                    if (next) setSelectedId(next.id);
                  }}
                >
                  <Trash2 />
                </TooltipIconButton>
              )}
            </div>

            <div className="space-y-2 p-4">
              <div className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span />
                <Label>Variable</Label>
                <Label>Value</Label>
                <span />
              </div>
              {selectedEnv.variables.map((variable) => (
                <div
                  key={variable.id}
                  className="grid grid-cols-[32px_1fr_1fr_32px] items-center gap-2"
                >
                  <Checkbox
                    checked={variable.enabled}
                    onCheckedChange={(checked) =>
                      updateEnvironmentVariable(selectedEnv.id, variable.id, {
                        enabled: checked === true,
                      })
                    }
                  />
                  <Input
                    value={variable.key}
                    placeholder="Variable"
                    className="font-mono text-sm"
                    onChange={(event) =>
                      updateEnvironmentVariable(selectedEnv.id, variable.id, {
                        key: event.target.value,
                      })
                    }
                  />
                  <Input
                    value={variable.value}
                    placeholder="Value"
                    className="font-mono text-sm"
                    onChange={(event) =>
                      updateEnvironmentVariable(selectedEnv.id, variable.id, {
                        value: event.target.value,
                      })
                    }
                  />
                  <TooltipIconButton
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    label="Remove variable"
                    onClick={() => removeEnvironmentVariable(selectedEnv.id, variable.id)}
                  >
                    <Trash2 className="size-4" />
                  </TooltipIconButton>
                </div>
              ))}
              <Button
                type="button"
                variant="link"
                className="h-auto px-0"
                onClick={() => addEnvironmentVariable(selectedEnv.id)}
              >
                + Add variable
              </Button>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Enabled variables are substituted automatically when you send requests.
              </p>
            </div>
          </div>
        )}
      </div>
    </ScrollAreaWithTop>
  );
}
