import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  FileCode2,
  FolderOpen,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  applyCustomThemeCss,
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
import {
  appendCssBlock,
  CUSTOM_CSS_COMPONENT_HOOKS,
  CUSTOM_CSS_SNIPPETS,
  CUSTOM_CSS_TOKEN_GROUPS,
  insertCssToken,
} from "@/lib/custom-theme-snippets";
import { downloadBlob } from "@/lib/download";
import { getAppSettings } from "@/lib/http-client";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function CustomThemeSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const livePreviewTimer = useRef<number | null>(null);
  const [cssPath, setCssPath] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [savedCssContent, setSavedCssContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
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

  useEffect(() => {
    return () => {
      if (livePreviewTimer.current != null) {
        window.clearTimeout(livePreviewTimer.current);
      }
    };
  }, []);

  const scheduleLivePreview = (nextCss: string) => {
    if (!livePreview) return;
    if (livePreviewTimer.current != null) {
      window.clearTimeout(livePreviewTimer.current);
    }
    livePreviewTimer.current = window.setTimeout(() => {
      applyCustomThemeCss(nextCss);
    }, 280);
  };

  const updateCssContent = (next: string) => {
    setCssContent(next);
    scheduleLivePreview(next);
  };

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
    updateCssContent(CUSTOM_THEME_CSS_TEMPLATE);
  };

  const handleInsertExample = () => {
    if (
      cssContent.trim() &&
      !window.confirm("Replace current CSS with the full override example file?")
    ) {
      return;
    }
    updateCssContent(CUSTOM_THEME_CSS_EXAMPLE);
  };

  const handleInsertSnippet = (css: string) => {
    updateCssContent(appendCssBlock(cssContent, css));
    toast.success("Snippet added");
  };

  const handleInsertToken = (token: string) => {
    updateCssContent(insertCssToken(cssContent, token));
  };

  const handleExport = () => {
    const content = cssContent.trim() || CUSTOM_THEME_CSS_TEMPLATE;
    downloadBlob(new Blob([content], { type: "text/css" }), "pulse-theme-override.css");
    toast.success("CSS exported", "pulse-theme-override.css");
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
            Override theme tokens and Pulse components. Use snippets, insert variables, or load a{" "}
            <code className="text-xs">.css</code> file.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={livePreview}
            onCheckedChange={(checked) => {
              const enabled = checked === true;
              setLivePreview(enabled);
              if (enabled) applyCustomThemeCss(cssContent);
              else if (!editorDirty) applyCustomThemeCss(savedCssContent);
            }}
            disabled={loading || busy}
          />
          <span>
            Live preview
            <span className="ml-1 text-xs text-muted-foreground">(applies while typing)</span>
          </span>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setToolsOpen((open) => !open)}
        >
          {toolsOpen ? "Hide tools" : "Show tools"}
        </Button>
      </div>

      {toolsOpen && (
        <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Snippets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_CSS_SNIPPETS.map((snippet) => (
                <Button
                  key={snippet.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={loading || busy}
                  title={snippet.description}
                  onClick={() => handleInsertSnippet(snippet.css)}
                >
                  {snippet.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                CSS variables
              </p>
              <div className="max-h-40 space-y-2 overflow-auto pr-1">
                {CUSTOM_CSS_TOKEN_GROUPS.map((group) => (
                  <div key={group.id}>
                    <p className="mb-1 text-[11px] font-medium text-foreground/80">{group.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.tokens.map((token) => (
                        <button
                          key={token.name}
                          type="button"
                          disabled={loading || busy}
                          title={token.hint}
                          className="rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-foreground hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                          onClick={() => handleInsertToken(token.name)}
                        >
                          {token.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Component hooks
              </p>
              <div className="flex flex-wrap gap-1">
                {CUSTOM_CSS_COMPONENT_HOOKS.map((hook) => (
                  <button
                    key={hook.name}
                    type="button"
                    disabled={loading || busy}
                    title={hook.hint}
                    className="rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-foreground hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                    onClick={() =>
                      handleInsertSnippet(
                        `${hook.name} {\n  /* ${hook.hint} */\n}\n`,
                      )
                    }
                  >
                    {hook.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="custom-theme-css-editor">
            CSS editor
            {editorDirty && (
              <span className="ml-2 text-[11px] font-normal text-warning">Unsaved changes</span>
            )}
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy}
              onClick={handleInsertTemplate}
            >
              <Sparkles className="size-3.5" />
              Starter
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy}
              onClick={handleInsertExample}
            >
              <BookOpen className="size-3.5" />
              Full example
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy || !cssContent.trim()}
              onClick={handleExport}
            >
              <Download className="size-3.5" />
              Export
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
          onChange={(event) => updateCssContent(event.target.value)}
          spellCheck={false}
          disabled={loading || busy}
          placeholder={CUSTOM_THEME_CSS_TEMPLATE}
          className="min-h-[360px] resize-y font-mono text-xs leading-relaxed"
        />

        <p className="text-xs text-muted-foreground">
          {livePreview
            ? "Live preview is on — edits apply after a short delay. Click Apply CSS to persist."
            : "Click Apply CSS to save. Snippets append blocks; variables insert into :root."}
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
