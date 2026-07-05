import type { ReactNode } from "react";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  resetKey?: string | number | null;
  width?: "wide" | "narrow" | "full";
  className?: string;
};

export function PageShell({
  children,
  resetKey,
  width = "wide",
  className,
}: PageShellProps) {
  return (
    <ScrollAreaWithTop className={cn("page-shell", className)} resetKey={resetKey}>
      <div
        className={cn(
          "page-content",
          width === "wide" && "page-content--wide",
          width === "narrow" && "page-content--narrow",
          width === "full" && "page-content--full",
        )}
      >
        {children}
      </div>
    </ScrollAreaWithTop>
  );
}

export function PageToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("page-toolbar", className)}>{children}</div>;
}
