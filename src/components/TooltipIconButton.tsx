import type { ComponentProps, ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type TooltipSide = "top" | "right" | "bottom" | "left";

type TooltipIconButtonProps = ComponentProps<typeof Button> & {
  label: string;
  side?: TooltipSide;
};

export function TooltipIconButton({
  label,
  side = "top",
  children,
  ...props
}: TooltipIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TooltipWrap({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: TooltipSide;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
