import type { HttpMethod } from "@/types";
import { methodBadgeClass, methodShortLabel } from "@/lib/method-colors";
import { cn } from "@/lib/utils";

type MethodBadgeProps = {
  method: HttpMethod | string;
  className?: string;
};

export function MethodBadge({ method, className }: MethodBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[34px] items-center justify-center rounded border px-1 py-0.5 font-mono text-[10px] font-bold leading-none",
        methodBadgeClass(method),
        className,
      )}
    >
      {methodShortLabel(method)}
    </span>
  );
}
