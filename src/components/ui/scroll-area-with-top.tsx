import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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
          className="size-full rounded-[inherit]"
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
        {showTopButton && showButton && (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className={cn(
              "absolute bottom-4 right-4 z-10 size-8 rounded-full shadow-md",
              topButtonClassName,
            )}
            onClick={scrollToTop}
            title="Scroll to top"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </ScrollAreaPrimitive.Root>
    );
  },
);
ScrollAreaWithTop.displayName = "ScrollAreaWithTop";
