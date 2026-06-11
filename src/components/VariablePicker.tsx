import { Braces } from "lucide-react";
import type { Environment } from "@/types";
import { getEnabledVariables, variableTemplate } from "@/lib/env";
import { TooltipWrap } from "@/components/TooltipIconButton";
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

type VariablePickerProps = {
  environment: Environment | null;
  onSelect: (key: string) => void;
  className?: string;
  disabled?: boolean;
};

export function VariablePicker({
  environment,
  onSelect,
  className,
  disabled,
}: VariablePickerProps) {
  const variables = getEnabledVariables(environment);

  return (
    <DropdownMenu>
      <TooltipWrap label="Insert variable">
        <DropdownMenuTrigger asChild disabled={disabled || variables.length === 0}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-7 shrink-0 text-muted-foreground", className)}
            aria-label="Insert environment variable"
            disabled={disabled || variables.length === 0}
          >
            <Braces className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipWrap>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Environment variables
        </DropdownMenuLabel>
        {variables.length === 0 ? (
          <DropdownMenuItem disabled>No enabled variables</DropdownMenuItem>
        ) : (
          variables.map((variable) => (
            <DropdownMenuItem
              key={variable.id}
              className="gap-2 font-mono text-xs"
              onClick={() => onSelect(variable.key)}
            >
              <span className="text-primary">{variableTemplate(variable.key)}</span>
              <span className="ml-auto truncate text-muted-foreground">{variable.value}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-xs text-muted-foreground">
          Use {"{{name}}"} in URL, headers, auth, or body
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
