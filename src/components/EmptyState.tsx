import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center px-4 py-6 text-center">
      <Inbox className="mb-2 size-5 text-muted-foreground/60" strokeWidth={1.5} />
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-[260px] text-[13px] text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
