import { Download } from "lucide-react";
import { collectionExportFilename, downloadJson } from "@/lib/download";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipWrap } from "@/components/TooltipIconButton";

export type CollectionExportFormat = "pulse" | "postman" | "openapi" | "bruno" | "insomnia";

type CollectionExportMenuProps = {
  collectionId: string;
  collectionName: string;
  exportCollection: (collectionId: string, format: CollectionExportFormat) => string | null;
  variant?: "icon" | "menu";
  className?: string;
};

const EXPORT_LABELS: Record<CollectionExportFormat, string> = {
  pulse: "Pulse collection",
  postman: "Postman collection",
  openapi: "OpenAPI 3.0",
  bruno: "Bruno collection",
  insomnia: "Insomnia export",
};

function exportSuffix(format: CollectionExportFormat): string {
  switch (format) {
    case "postman":
      return "postman_collection.json";
    case "openapi":
      return "openapi.json";
    case "bruno":
      return "bruno_collection.json";
    case "insomnia":
      return "insomnia_export.json";
    default:
      return "pulse_collection.json";
  }
}

export function CollectionExportMenu({
  collectionId,
  collectionName,
  exportCollection,
  variant = "icon",
  className,
}: CollectionExportMenuProps) {
  const handleExport = (format: CollectionExportFormat) => {
    const content = exportCollection(collectionId, format);
    if (!content) {
      toast.error("Export failed", "Collection not found");
      return;
    }

    downloadJson(content, collectionExportFilename(collectionName, exportSuffix(format)));
    toast.success("Collection exported", `${collectionName} (${EXPORT_LABELS[format]})`);
  };

  return (
    <DropdownMenu>
      <TooltipWrap label="Export collection">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={variant === "icon" ? "icon" : "sm"}
            className={className ?? (variant === "icon" ? "size-7 shrink-0" : "gap-1.5")}
            aria-label="Export collection"
            onClick={(event) => event.stopPropagation()}
          >
            <Download className="size-3.5" />
            {variant === "menu" && "Export"}
          </Button>
        </DropdownMenuTrigger>
      </TooltipWrap>
      <DropdownMenuContent align="end" className="w-52">
        {(Object.keys(EXPORT_LABELS) as CollectionExportFormat[]).map((format) => (
          <DropdownMenuItem key={format} onClick={() => handleExport(format)}>
            {EXPORT_LABELS[format]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
