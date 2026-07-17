import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ArrowUp } from "lucide-react";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ScrollAreaWithTopProps = React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
  resetKey?: string | number | null;
  showTopButton?: boolean;
  topButtonClassName?: string;
};

export const ScrollAreaWithTop = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaWithTopProps
>(
  (
    { className, children, resetKey, showTopButton = true, topButtonClassName, ...props },
    ref,
  ) => {
    const viewportRef = React.useRef<HTMLDivElement>(null);
    const [showButton, setShowButton] = React.useState(false);

    const scrollToTop = React.useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top: 0, behavior: "smooth" });
    }, []);

    React.useEffect(() => {
      scrollToTop();
      setShowButton(false);
    }, [resetKey, scrollToTop]);

    React.useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const onScroll = () => {
        setShowButton(viewport.scrollTop > 120);
      };

      onScroll();
      viewport.addEventListener("scroll", onScroll, { passive: true });
      return () => viewport.removeEventListener("scroll", onScroll);
    }, [resetKey]);

    return (
      <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn("relative overflow-hidden", className)}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          className="size-full rounded-[inherit] [&>div]:!block [&>div]:!min-w-0"
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
        {showTopButton && showButton && (
          <TooltipIconButton
            size="icon"
            variant="secondary"
            className={cn(
              "absolute bottom-4 right-4 z-10 size-8 rounded-full shadow-md",
              topButtonClassName,
            )}
            label="Scroll to top"
            onClick={scrollToTop}
          >
            <ArrowUp className="size-4" />
          </TooltipIconButton>
        )}
      </ScrollAreaPrimitive.Root>
    );
  },
);
ScrollAreaWithTop.displayName = "ScrollAreaWithTop";
