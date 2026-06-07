import { Filter, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useApp } from "@/machines";
import {
  countActiveOverviewFilters,
  isOverviewFilterDefault,
  OVERVIEW_METHODS,
  OVERVIEW_SOURCE_OPTIONS,
  OVERVIEW_STATUS_OPTIONS,
  removeOverviewMethod,
  removeOverviewSource,
  removeOverviewStatus,
  toggleOverviewMethod,
  toggleOverviewSource,
  toggleOverviewStatus,
  type OverviewFilter,
  type OverviewStatusFilter,
} from "@/lib/filters";
import { MethodBadge } from "@/components/MethodBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { statusBadgeClass } from "@/lib/method-colors";

type OverviewFilterMenuProps = {
  totalCount: number;
  filteredCount: number;
};

const statusChipClass: Record<OverviewStatusFilter, string> = {
  "2xx": statusBadgeClass(200),
  "3xx": statusBadgeClass(302),
  "4xx": statusBadgeClass(404),
  "5xx": statusBadgeClass(500),
  none: "border-border bg-muted text-muted-foreground",
};

function FilterChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function OverviewFilterMenu({ totalCount, filteredCount }: OverviewFilterMenuProps) {
  const { overviewFilter, setOverviewFilter, resetOverviewFilter } = useApp();
  const activeCount = countActiveOverviewFilters(overviewFilter);

  const applyPreset = (patch: Partial<OverviewFilter>) => {
    setOverviewFilter(patch);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("gap-2", activeCount > 0 && "border-primary")}>
          <Filter className="size-4" />
          Filter
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(420px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Filters</p>
            <p className="text-xs text-muted-foreground">
              {filteredCount} of {totalCount} items
            </p>
          </div>
          {!isOverviewFilterDefault(overviewFilter) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              onClick={resetOverviewFilter}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </div>

        <div className="space-y-4 px-4 py-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={overviewFilter.statuses.includes("4xx") && overviewFilter.statuses.includes("5xx")}
                onClick={() =>
                  applyPreset({
                    statuses: ["4xx", "5xx"],
                    methods: [],
                    sources: [],
                  })
                }
              >
                Errors only
              </FilterChip>
              <FilterChip
                active={overviewFilter.statuses.length === 1 && overviewFilter.statuses[0] === "2xx"}
                onClick={() => applyPreset({ statuses: ["2xx"], methods: [], sources: [] })}
              >
                Success
              </FilterChip>
              <FilterChip
                active={overviewFilter.methods.length === 1 && overviewFilter.methods[0] === "GET"}
                onClick={() => applyPreset({ methods: ["GET"], sources: [], statuses: [] })}
              >
                GET only
              </FilterChip>
              <FilterChip
                active={overviewFilter.sources.length === 1 && overviewFilter.sources[0] === "collections"}
                onClick={() => applyPreset({ sources: ["collections"], methods: [], statuses: [] })}
              >
                Collections
              </FilterChip>
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Method</p>
            <div className="grid grid-cols-4 gap-2">
              {OVERVIEW_METHODS.map((method) => {
                const active = overviewFilter.methods.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setOverviewFilter(toggleOverviewMethod(overviewFilter, method))}
                    className={cn(
                      "rounded-md border p-1 transition-colors",
                      active
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-transparent hover:border-border hover:bg-muted/50",
                    )}
                  >
                    <MethodBadge method={method} className="w-full" />
                  </button>
                );
              })}
            </div>
            {overviewFilter.methods.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {overviewFilter.methods.length} selected · click again to remove
              </p>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Source</p>
            <div className="flex flex-wrap gap-2">
              {OVERVIEW_SOURCE_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value}
                  active={overviewFilter.sources.includes(option.value)}
                  onClick={() => setOverviewFilter(toggleOverviewSource(overviewFilter, option.value))}
                >
                  {option.label}
                </FilterChip>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="flex flex-wrap gap-2">
              {OVERVIEW_STATUS_OPTIONS.map((option) => (
                <FilterChip
                  key={option.value}
                  active={overviewFilter.statuses.includes(option.value)}
                  onClick={() => setOverviewFilter(toggleOverviewStatus(overviewFilter, option.value))}
                  className={cn(
                    overviewFilter.statuses.includes(option.value) && statusChipClass[option.value],
                  )}
                >
                  <span className="font-mono">{option.label}</span>
                  <span className="ml-1 text-[10px] opacity-80">{option.hint}</span>
                </FilterChip>
              ))}
            </div>
          </section>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ActiveOverviewFiltersProps = {
  filter: OverviewFilter;
  onChange: (patch: Partial<OverviewFilter>) => void;
  onReset: () => void;
};

export function ActiveOverviewFilters({ filter, onChange, onReset }: ActiveOverviewFiltersProps) {
  if (isOverviewFilterDefault(filter)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Active:</span>
      {filter.query.trim() && (
        <FilterTag label={`"${filter.query.trim()}"`} onRemove={() => onChange({ query: "" })} />
      )}
      {filter.methods.map((method) => (
        <FilterTag
          key={method}
          label={method}
          onRemove={() => onChange(removeOverviewMethod(filter, method))}
        />
      ))}
      {filter.sources.map((source) => (
        <FilterTag
          key={source}
          label={source === "history" ? "History" : "Collections"}
          onRemove={() => onChange(removeOverviewSource(filter, source))}
        />
      ))}
      {filter.statuses.map((status) => (
        <FilterTag
          key={status}
          label={status === "none" ? "No response" : status}
          onRemove={() => onChange(removeOverviewStatus(filter, status))}
        />
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onReset}>
        Clear all
      </Button>
    </div>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs">
      {label}
      <button
        type="button"
        className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
