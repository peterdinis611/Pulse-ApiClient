import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  className?: string;
};

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-surface-1/40 px-6 py-8 text-center",
        className,
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted/60">
        <Inbox className="size-4 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="text-body font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[280px] text-body text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
