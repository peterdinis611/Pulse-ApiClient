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

type CollectionExportMenuProps = {
  collectionId: string;
  collectionName: string;
  exportCollection: (collectionId: string, format: "pulse" | "postman") => string | null;
  variant?: "icon" | "menu";
  className?: string;
};

export function CollectionExportMenu({
  collectionId,
  collectionName,
  exportCollection,
  variant = "icon",
  className,
}: CollectionExportMenuProps) {
  const handleExport = (format: "pulse" | "postman") => {
    const content = exportCollection(collectionId, format);
    if (!content) {
      toast.error("Export failed", "Collection not found");
      return;
    }

    const suffix = format === "postman" ? "postman_collection.json" : "pulse_collection.json";
    downloadJson(content, collectionExportFilename(collectionName, suffix));
    toast.success(
      "Collection exported",
      format === "postman" ? `${collectionName} (Postman)` : `${collectionName} (Pulse)`,
    );
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
        <DropdownMenuItem onClick={() => handleExport("pulse")}>Pulse collection</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("postman")}>Postman collection</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
