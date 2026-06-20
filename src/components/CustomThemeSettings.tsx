import { useCallback, useEffect, useRef, useState } from "react";
import { FileCode2, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import {
  applyCustomThemeFromBrowserFile,
  applyCustomThemeFromPath,
  clearCustomThemeCss,
  getBrowserCustomThemePath,
  loadAndApplyCustomThemeCss,
  pickCustomThemeCssFile,
  reloadCustomThemeCss,
} from "@/lib/custom-theme";
import { getAppSettings } from "@/lib/http-client";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function CustomThemeSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cssPath, setCssPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isDesktop = canUseTauriIpc();

  const refreshPath = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      if (isDesktop) {
        const settings = await getAppSettings();
        const path = settings.customThemeCssPath?.trim() ?? "";
        setCssPath(path);
        if (path) {
          try {
            await reloadCustomThemeCss(path);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not load custom CSS";
            setLoadError(message);
          }
        }
      } else {
        setCssPath(getBrowserCustomThemePath() ?? "");
        await loadAndApplyCustomThemeCss();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load custom theme settings";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    void refreshPath();
  }, [refreshPath]);

  const applyPath = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;

    setBusy(true);
    setLoadError(null);
    try {
      await applyCustomThemeFromPath(trimmed);
      setCssPath(trimmed);
      toast.success("Custom theme CSS applied");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply custom CSS";
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleBrowse = async () => {
    if (isDesktop) {
      setBusy(true);
      setLoadError(null);
      try {
        const selected = await pickCustomThemeCssFile();
        if (!selected) return;
        await applyPath(selected);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to choose CSS file";
        setLoadError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
      return;
    }

    fileInputRef.current?.click();
  };

  const handleBrowserFile = async (file: File | undefined) => {
    if (!file) return;

    setBusy(true);
    setLoadError(null);
    try {
      await applyCustomThemeFromBrowserFile(file);
      setCssPath(file.name);
      toast.success("Custom theme CSS applied");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read CSS file";
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReload = async () => {
    if (!cssPath.trim()) return;

    setBusy(true);
    setLoadError(null);
    try {
      await reloadCustomThemeCss(cssPath.trim());
      toast.success("Custom theme CSS reloaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reload CSS file";
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    setLoadError(null);
    try {
      await clearCustomThemeCss();
      setCssPath("");
      toast.success("Custom theme CSS removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear custom CSS";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileCode2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Custom CSS file</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Load a <code className="text-xs">.css</code> file to override theme variables and styles on top of
            your selected theme.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="custom-theme-css-path">CSS file</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="custom-theme-css-path"
            value={cssPath}
            readOnly={!isDesktop}
            placeholder={isDesktop ? "/path/to/theme.css" : "No CSS file selected"}
            disabled={loading || busy}
            onChange={(event) => {
              if (!isDesktop) return;
              setCssPath(event.target.value);
            }}
            onKeyDown={(event) => {
              if (!isDesktop || event.key !== "Enter") return;
              event.preventDefault();
              void applyPath(cssPath);
            }}
            className={cn("font-mono text-xs", !isDesktop && "cursor-default")}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={loading || busy} onClick={() => void handleBrowse()}>
              <FolderOpen className="size-4" />
              Browse
            </Button>
            {isDesktop && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || busy || !cssPath.trim()}
                onClick={() => void applyPath(cssPath)}
              >
                Apply
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy || !cssPath.trim()}
              onClick={() => void handleReload()}
            >
              <RefreshCw className="size-4" />
              Reload
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy || !cssPath.trim()}
              onClick={() => void handleClear()}
            >
              <Trash2 className="size-4" />
              Clear
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".css,text/css"
        className="hidden"
        onChange={(event) => void handleBrowserFile(event.target.files?.[0])}
      />

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {!isDesktop && (
        <p className="text-xs text-muted-foreground">
          In the browser preview, the selected file is stored locally for this session. Use the desktop app to
          keep a file path and reload edits from disk.
        </p>
      )}
    </div>
  );
}
