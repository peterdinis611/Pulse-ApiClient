import { useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { useApp } from "@/machines";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageShell, PageToolbar } from "@/components/PageShell";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/lib/toast";
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
  const [deleteEnvOpen, setDeleteEnvOpen] = useState(false);

  const selectedEnv =
    environments.find((env) => env.id === selectedId) ?? environments[0] ?? null;

  return (
    <PageShell resetKey="environments">
      <PageToolbar className="justify-end">
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={addEnvironment}>
          <Plus />
          New
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => importRef.current?.click()}
        >
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
      </PageToolbar>

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
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-body transition-colors",
                selected
                  ? "border-primary/40 bg-primary/10 text-foreground shadow-sm"
                  : "border-border/70 bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className="font-medium">{env.name}</span>
              {active && (
                <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                  Default
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedEnv && (
        <Panel>
          <PanelHeader
            actions={
              environments.length > 1 ? (
                <TooltipIconButton
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  label="Delete environment"
                  onClick={() => setDeleteEnvOpen(true)}
                >
                  <Trash2 />
                </TooltipIconButton>
              ) : undefined
            }
          >
            <Input
              className="max-w-xs border-transparent bg-transparent px-0 text-title shadow-none focus-visible:ring-0"
              value={selectedEnv.name}
              onChange={(event) => updateEnvironment(selectedEnv.id, { name: event.target.value })}
            />
            <Button
              type="button"
              variant={activeEnvironmentId === selectedEnv.id ? "secondary" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setActiveEnvironmentId(selectedEnv.id)}
            >
              {activeEnvironmentId === selectedEnv.id ? "Workspace default" : "Set as default"}
            </Button>
          </PanelHeader>

          <PanelBody className="space-y-2">
            <div className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 px-1 text-caption">
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
                  className="h-8 font-mono text-[13px]"
                  onChange={(event) =>
                    updateEnvironmentVariable(selectedEnv.id, variable.id, {
                      key: event.target.value,
                    })
                  }
                />
                <Input
                  value={variable.value}
                  placeholder="Value"
                  className="h-8 font-mono text-[13px]"
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
            <p className="text-body text-muted-foreground">
              Use {"{{variableName}}"} in URLs, headers, and bodies. Enabled variables are substituted
              automatically when you send requests.
            </p>
          </PanelBody>
        </Panel>
      )}

      <ConfirmDialog
        open={deleteEnvOpen}
        onOpenChange={setDeleteEnvOpen}
        title="Delete environment?"
        description={
          selectedEnv
            ? `“${selectedEnv.name}” and its variables will be permanently removed.`
            : "This environment will be permanently removed."
        }
        confirmLabel="Delete environment"
        onConfirm={() => {
          if (!selectedEnv) return;
          const id = selectedEnv.id;
          const name = selectedEnv.name;
          deleteEnvironment(id);
          const next = environments.find((env) => env.id !== id);
          if (next) setSelectedId(next.id);
          toast.success("Environment deleted", name);
        }}
      />
    </PageShell>
  );
}
