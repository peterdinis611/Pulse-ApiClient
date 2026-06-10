import { Check, ChevronDown, Globe2, Layers, Plus, Settings2 } from "lucide-react";
import type { Environment } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type EnvironmentSwitcherMode = "workspace" | "request";

type EnvironmentSwitcherProps = {
  mode: EnvironmentSwitcherMode;
  environments: Environment[];
  workspaceEnvironmentId: string | null;
  workspaceEnvironment: Environment | null;
  requestEnvironment: Environment | null;
  tabOverrideId?: string | null;
  onSetWorkspace: (id: string) => void;
  onSetTabOverride?: (id: string | null) => void;
  onAddEnvironment?: () => void;
  onManageEnvironments?: () => void;
  compact?: boolean;
  className?: string;
};

export function EnvironmentSwitcher({
  mode,
  environments,
  workspaceEnvironmentId,
  workspaceEnvironment,
  requestEnvironment,
  tabOverrideId = null,
  onSetWorkspace,
  onSetTabOverride,
  onAddEnvironment,
  onManageEnvironments,
  compact = false,
  className,
}: EnvironmentSwitcherProps) {
  const effective = mode === "workspace" ? workspaceEnvironment : requestEnvironment;
  const label = effective?.name ?? "No environment";
  const hasTabOverride =
    mode === "request" &&
    tabOverrideId != null &&
    tabOverrideId !== workspaceEnvironmentId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className={cn(
            "max-w-[220px] justify-between gap-2 border-border/80 bg-background/80 font-normal",
            compact ? "h-8 px-2.5 text-xs" : "h-9",
            hasTabOverride && "border-primary/40 bg-primary/5",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe2 className={cn("shrink-0 text-primary", compact ? "size-3.5" : "size-4")} />
            <span className="truncate">{label}</span>
            {hasTabOverride && (
              <span className="rounded bg-primary/15 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                Tab
              </span>
            )}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {mode === "workspace" ? "Workspace environment" : "Request environment"}
        </DropdownMenuLabel>

        {mode === "request" && onSetTabOverride && (
          <>
            <DropdownMenuItem
              onClick={() => onSetTabOverride(null)}
              className="gap-2"
            >
              <Layers className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">
                Workspace default
                {workspaceEnvironment ? ` · ${workspaceEnvironment.name}` : ""}
              </span>
              {!hasTabOverride && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {environments.map((env) => {
          const selected =
            mode === "workspace"
              ? env.id === workspaceEnvironmentId
              : env.id === requestEnvironment?.id;

          return (
            <DropdownMenuItem
              key={env.id}
              onClick={() => {
                if (mode === "workspace") {
                  onSetWorkspace(env.id);
                  return;
                }
                onSetTabOverride?.(
                  env.id === workspaceEnvironmentId ? null : env.id,
                );
              }}
              className="gap-2"
            >
              <Globe2 className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate">{env.name}</span>
              <span className="text-xs text-muted-foreground">
                {env.variables.filter((v) => v.enabled && v.key).length} vars
              </span>
              {selected && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}

        {(onAddEnvironment || onManageEnvironments) && (
          <>
            <DropdownMenuSeparator />
            {onAddEnvironment && (
              <DropdownMenuItem onClick={onAddEnvironment} className="gap-2">
                <Plus className="size-4" />
                New environment
              </DropdownMenuItem>
            )}
            {onManageEnvironments && (
              <DropdownMenuItem onClick={onManageEnvironments} className="gap-2">
                <Settings2 className="size-4" />
                Manage environments
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
