import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { cn } from "@/lib/utils";

type ScrollState = {
  overflowing: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

function readScrollState(element: HTMLDivElement): ScrollState {
  const { scrollLeft, scrollWidth, clientWidth } = element;
  const overflowing = scrollWidth > clientWidth + 1;
  const maxScroll = Math.max(scrollWidth - clientWidth, 0);

  return {
    overflowing,
    canScrollLeft: overflowing && scrollLeft > 1,
    canScrollRight: overflowing && scrollLeft < maxScroll - 1,
  };
}

type TabScrollStripProps = {
  children: ReactNode;
  className?: string;
  activeItemId?: string | null;
  onOverflowChange?: (overflowing: boolean) => void;
};

export function TabScrollStrip({
  children,
  className,
  activeItemId,
  onOverflowChange,
}: TabScrollStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>(() => ({
    overflowing: false,
    canScrollLeft: false,
    canScrollRight: false,
  }));

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const next = readScrollState(element);
    setScrollState(next);
    onOverflowChange?.(next.overflowing);
  }, [onOverflowChange]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    const inner = element.firstElementChild;
    if (inner) observer.observe(inner);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, children]);

  useEffect(() => {
    if (!activeItemId) return;
    const element = scrollRef.current;
    if (!element) return;

    const activeEl = element.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(activeItemId)}"]`,
    );
    activeEl?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeItemId, children]);

  const scrollToAdjacentTab = (direction: -1 | 1) => {
    const element = scrollRef.current;
    if (!element) return;

    const tabElements = Array.from(
      element.querySelectorAll<HTMLElement>("[data-tab-id]"),
    );
    if (tabElements.length === 0) return;

    const viewLeft = element.scrollLeft;
    const viewRight = viewLeft + element.clientWidth;

    if (direction === 1) {
      const nextHidden = tabElements.find(
        (tab) => tab.offsetLeft + tab.offsetWidth > viewRight + 2,
      );
      if (nextHidden) {
        nextHidden.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        return;
      }
      element.scrollTo({ left: element.scrollWidth, behavior: "smooth" });
      return;
    }

    const previousHidden = [...tabElements]
      .reverse()
      .find((tab) => tab.offsetLeft < viewLeft - 2);
    if (previousHidden) {
      previousHidden.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
      return;
    }
    element.scrollTo({ left: 0, behavior: "smooth" });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!element || !scrollState.overflowing) return;

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;

    element.scrollLeft += delta;
    event.preventDefault();
  };

  return (
    <div className={cn("flex h-9 min-w-0 flex-1 items-stretch", className)}>
      {scrollState.overflowing && (
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 shrink-0 rounded-none border-r border-border/60",
            !scrollState.canScrollLeft && "pointer-events-none opacity-30",
          )}
          label="Previous tabs"
          disabled={!scrollState.canScrollLeft}
          onClick={() => scrollToAdjacentTab(-1)}
        >
          <ChevronLeft className="size-4" />
        </TooltipIconButton>
      )}

      <div className="relative min-w-0 flex-1">
        {scrollState.canScrollLeft && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background via-background/90 to-transparent"
          />
        )}
        {scrollState.canScrollRight && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background via-background/90 to-transparent"
          />
        )}

        <div
          ref={scrollRef}
          className="tab-scroll-viewport h-9 overflow-x-auto overflow-y-hidden overscroll-x-contain"
          onWheel={handleWheel}
        >
          <div className="flex h-9 w-max min-w-full items-stretch">{children}</div>
        </div>
      </div>

      {scrollState.overflowing && (
        <TooltipIconButton
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 shrink-0 rounded-none border-l border-border/60",
            !scrollState.canScrollRight && "pointer-events-none opacity-30",
          )}
          label="Next tabs"
          disabled={!scrollState.canScrollRight}
          onClick={() => scrollToAdjacentTab(1)}
        >
          <ChevronRight className="size-4" />
        </TooltipIconButton>
      )}
    </div>
  );
}
