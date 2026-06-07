import { Filter, RotateCcw } from "lucide-react";
import { useApp } from "@/machines";
import type { OverviewFilter } from "@/lib/filters";
import { HTTP_METHODS } from "@/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const sourceOptions: Array<{ value: OverviewFilter["source"]; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "history", label: "History only" },
  { value: "collections", label: "Collections only" },
];

const statusOptions: Array<{ value: OverviewFilter["status"]; label: string }> = [
  { value: "all", label: "Any status" },
  { value: "2xx", label: "2xx success" },
  { value: "4xx", label: "4xx client error" },
  { value: "5xx", label: "5xx server error" },
];

export function OverviewFilterMenu() {
  const { overviewFilter, setOverviewFilter, resetOverviewFilter } = useApp();

  const activeCount = [
    overviewFilter.method !== "ALL",
    overviewFilter.source !== "all",
    overviewFilter.status !== "all",
  ].filter(Boolean).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn(activeCount > 0 && "border-primary")}>
          <Filter className="size-4" />
          Filter
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Method</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={overviewFilter.method}
          onValueChange={(value) =>
            setOverviewFilter({ method: value as OverviewFilter["method"] })
          }
        >
          <DropdownMenuRadioItem value="ALL">All methods</DropdownMenuRadioItem>
          {HTTP_METHODS.map((method) => (
            <DropdownMenuRadioItem key={method} value={method}>
              {method}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Source</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={overviewFilter.source}
          onValueChange={(value) =>
            setOverviewFilter({ source: value as OverviewFilter["source"] })
          }
        >
          {sourceOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={overviewFilter.status}
          onValueChange={(value) =>
            setOverviewFilter({ status: value as OverviewFilter["status"] })
          }
        >
          {statusOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={resetOverviewFilter}
        >
          <RotateCcw className="size-4" />
          Reset filters
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
