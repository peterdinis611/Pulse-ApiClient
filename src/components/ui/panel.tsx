import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Panel({ className, children, ...props }: PanelProps) {
  return (
    <div className={cn("ui-panel", className)} {...props}>
      {children}
    </div>
  );
}

type PanelHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  label?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export function PanelHeader({ title, label, actions, children, className, ...props }: PanelHeaderProps) {
  return (
    <div className={cn("ui-panel-header", className)} {...props}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {label && <span className="text-caption shrink-0">{label}</span>}
        {title && <span className="text-body font-medium text-foreground">{title}</span>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PanelBody({ className, children, ...props }: PanelProps) {
  return (
    <div className={cn("ui-panel-body", className)} {...props}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={cn("ui-stat-card", className)}>
      <p className="text-caption">{label}</p>
      <p className="mt-1.5 text-heading tabular-nums">{value}</p>
    </div>
  );
}
