import { useRef, useState } from "react";
import { Download, FileUp, LoaderCircle, Upload } from "lucide-react";
import {
  inspectCollectionImport,
  summarizeWorkspaceExport,
  workspaceExportFilename,
} from "@/lib/collection-io";
import { downloadJson } from "@/lib/download";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipIconButton, TooltipWrap } from "@/components/TooltipIconButton";
import { cn } from "@/lib/utils";

type ExplorerTransferMenuProps = {
  collectionCount: number;
  requestCount: number;
  exportCollections: () => string;
  importCollections: (raw: string) => void;
  className?: string;
};

export function ExplorerTransferMenu({
  collectionCount,
  requestCount,
  exportCollections,
  importCollections,
  className,
}: ExplorerTransferMenuProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const hasCollections = collectionCount > 0;
  const exportSummary = summarizeWorkspaceExport(collectionCount, requestCount);

  const handleExportAll = () => {
    if (!hasCollections) {
      toast.info("Nothing to export", "Create or import a collection first.");
      return;
    }
    const filename = workspaceExportFilename();
    downloadJson(exportCollections(), filename);
    toast.success("Exported all collections", `${exportSummary} → ${filename}`);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const raw = await file.text();
      const inspection = inspectCollectionImport(raw);
      if (inspection.format === "unknown") {
        toast.error(
          "Unrecognized file",
          "Use Pulse, Postman, Bruno, Insomnia, or OpenAPI JSON/YAML.",
        );
        return;
      }

      importCollections(raw);

      const detailParts = [inspection.label];
      if (inspection.collectionCount > 0) {
        detailParts.push(
          inspection.collectionCount === 1
            ? "1 collection"
            : `${inspection.collectionCount} collections`,
        );
      }
      if (inspection.requestCount > 0) {
        detailParts.push(
          inspection.requestCount === 1 ? "1 request" : `${inspection.requestCount} requests`,
        );
      }
      toast.success("Imported", `${detailParts.join(" · ")} · ${file.name}`);
    } catch (error) {
      toast.error(
        "Import failed",
        error instanceof Error ? error.message : "Could not read that file.",
      );
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <TooltipIconButton
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-foreground"
        label="Import collection (Pulse, Postman, Bruno, Insomnia, OpenAPI)"
        disabled={importing}
        onClick={() => importRef.current?.click()}
      >
        {importing ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
      </TooltipIconButton>

      <DropdownMenu>
        <TooltipWrap label={hasCollections ? `Export all · ${exportSummary}` : "Export all"}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label="Export collections"
            >
              <Download className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipWrap>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            Workspace export
          </DropdownMenuLabel>
          <DropdownMenuItem disabled={!hasCollections} onClick={handleExportAll}>
            <Download className="size-3.5" />
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span>Export all collections</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {hasCollections ? `${exportSummary} · Pulse JSON` : "No collections yet"}
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => importRef.current?.click()} disabled={importing}>
            <FileUp className="size-3.5" />
            <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span>Import file…</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Auto-detects format
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json,.yaml,.yml"
        hidden
        onChange={(event) => void handleImportFile(event.target.files?.[0])}
      />
    </div>
  );
}
