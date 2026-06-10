import { useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = ComponentPropsWithoutRef<typeof Input>;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <TooltipIconButton
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 size-9 text-muted-foreground hover:text-foreground"
        label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((current) => !current)}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </TooltipIconButton>
    </div>
  );
}
