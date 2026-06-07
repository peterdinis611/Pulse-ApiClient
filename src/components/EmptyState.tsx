type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center px-4 py-8 text-center">
      <div className="mb-3 size-10 rounded-md border border-dashed border-border bg-muted" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-[260px] text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
