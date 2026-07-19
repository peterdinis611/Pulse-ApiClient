import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, FileCode2, FolderOpen, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  applyCustomThemeFromBrowserFile,
  applyCustomThemeFromPath,
  clearCustomThemeCss,
  CUSTOM_THEME_CSS_EXAMPLE,
  CUSTOM_THEME_CSS_TEMPLATE,
  getBrowserCustomThemePath,
  loadCustomThemeCssForEditor,
  pickCustomThemeCssFile,
  reloadCustomThemeCss,
  saveCustomThemeCssContent,
} from "@/lib/custom-theme";
import { getAppSettings } from "@/lib/http-client";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function CustomThemeSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cssPath, setCssPath] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [savedCssContent, setSavedCssContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isDesktop = canUseTauriIpc();
  const editorDirty = cssContent !== savedCssContent;

  const refreshEditor = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      let path = "";
      if (isDesktop) {
        const settings = await getAppSettings();
        path = settings.customThemeCssPath?.trim() ?? "";
      } else {
        path = getBrowserCustomThemePath() ?? "";
      }

      setCssPath(path);
      const content = await loadCustomThemeCssForEditor(path || null);
      setCssContent(content);
      setSavedCssContent(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load custom theme settings";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    void refreshEditor();
  }, [refreshEditor]);

  const applyPath = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;

    setBusy(true);
    setLoadError(null);
    try {
      await applyCustomThemeFromPath(trimmed);
      setCssPath(trimmed);
      const content = await loadCustomThemeCssForEditor(trimmed);
      setCssContent(content);
      setSavedCssContent(content);
      toast.success("Custom theme CSS loaded from file");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply custom CSS";
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleApplyEditor = () => {
    setBusy(true);
    setLoadError(null);
    try {
      saveCustomThemeCssContent(cssContent);
      setSavedCssContent(cssContent);
      toast.success("Custom CSS applied");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply custom CSS";
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleInsertTemplate = () => {
    if (cssContent.trim() && !window.confirm("Replace current CSS with the starter template?")) {
      return;
    }
    setCssContent(CUSTOM_THEME_CSS_TEMPLATE);
  };

  const handleInsertExample = () => {
    if (
      cssContent.trim() &&
      !window.confirm("Replace current CSS with the full override example file?")
    ) {
      return;
    }
    setCssContent(CUSTOM_THEME_CSS_EXAMPLE);
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
      const content = await loadCustomThemeCssForEditor(null);
      setCssContent(content);
      setSavedCssContent(content);
      toast.success("Custom theme CSS loaded from file");
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
      const content = await loadCustomThemeCssForEditor(cssPath.trim());
      setCssContent(content);
      setSavedCssContent(content);
      toast.success("Custom theme CSS reloaded from file");
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
      setCssContent("");
      setSavedCssContent("");
      toast.success("Custom theme CSS removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear custom CSS";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/70 bg-muted/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileCode2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Custom CSS</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Edit CSS below or load a <code className="text-xs">.css</code> file to override theme
            variables and Pulse styles on top of your selected theme.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="custom-theme-css-editor">CSS editor</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy}
              onClick={handleInsertTemplate}
            >
              <Sparkles className="size-3.5" />
              Starter template
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy}
              onClick={handleInsertExample}
            >
              <BookOpen className="size-3.5" />
              Load example file
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={loading || busy || !editorDirty}
              onClick={handleApplyEditor}
            >
              Apply CSS
            </Button>
          </div>
        </div>

        <Textarea
          id="custom-theme-css-editor"
          value={cssContent}
          onChange={(event) => setCssContent(event.target.value)}
          spellCheck={false}
          disabled={loading || busy}
          placeholder={CUSTOM_THEME_CSS_TEMPLATE}
          className="min-h-[320px] resize-y font-mono text-xs leading-relaxed"
        />

        <p className="text-xs text-muted-foreground">
          Changes apply after you click <span className="font-medium text-foreground">Apply CSS</span>.
          Use <span className="font-medium text-foreground">Load example file</span> for a full demo
          of tokens (primary, chrome, methods, fonts…) and component hooks (
          <code className="text-[11px]">.request-url-composite</code>,{" "}
          <code className="text-[11px]">.explorer-row--active</code>, …). Source:{" "}
          <code className="text-[11px]">examples/pulse-theme-override.example.css</code>.
        </p>
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <Label htmlFor="custom-theme-css-path">Load from file {isDesktop ? "" : "(browser)"}</Label>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy}
              onClick={() => void handleBrowse()}
            >
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
                Load file
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
              disabled={loading || busy || (!cssPath.trim() && !cssContent.trim())}
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
          In the browser preview, CSS is stored locally in this browser. Use the desktop app to keep
          a file path and reload edits from disk.
        </p>
      )}
    </div>
  );
}
