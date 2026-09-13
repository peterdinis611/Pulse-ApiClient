import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileJson, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import {
  applyCustomLanguageFromBrowserFile,
  applyCustomLanguageFromPath,
  applyCustomLanguageFromText,
  clearCustomLanguage,
  getBrowserCustomLanguagePath,
  languagePackTemplateJson,
  pickCustomLanguageJsonFile,
  reloadCustomLanguage,
} from "@/lib/custom-language";
import { getCustomLanguagePack, getResolvedLocale, type LocalePreference } from "@/lib/i18n";
import { downloadJson } from "@/lib/download";
import { getAppSettings } from "@/lib/http-client";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { toast } from "@/lib/toast";
import { useI18n } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const LOCALE_OPTIONS: Array<{ id: LocalePreference; hint: string }> = [
  { id: "system", hint: "OS" },
  { id: "en", hint: "EN" },
  { id: "sk", hint: "SK" },
];

export function LanguageSettings() {
  const { t, locale, setLocale } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jsonPath, setJsonPath] = useState("");
  const [jsonContent, setJsonContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isDesktop = canUseTauriIpc();
  const pack = getCustomLanguagePack();
  const keyCount = pack ? Object.keys(pack.strings).length : 0;
  const resolved = getResolvedLocale();

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      let path = "";
      if (isDesktop) {
        const settings = await getAppSettings();
        path = settings.customLanguageJsonPath?.trim() ?? "";
      } else {
        path = getBrowserCustomLanguagePath() ?? "";
      }
      setJsonPath(path);
      const current = getCustomLanguagePack();
      setJsonContent(current ? JSON.stringify({ meta: current.meta, strings: current.strings }, null, 2) : "");
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.language.loadFailed");
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, [isDesktop, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleBrowse = async () => {
    setBusy(true);
    setLoadError(null);
    try {
      if (isDesktop) {
        const selected = await pickCustomLanguageJsonFile();
        if (!selected) return;
        await applyCustomLanguageFromPath(selected);
        toast.success(t("settings.language.applied"));
        await refresh();
        return;
      }
      fileInputRef.current?.click();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.language.loadFailed");
      setLoadError(message);
      toast.error(t("settings.language.loadFailed"), message);
    } finally {
      setBusy(false);
    }
  };

  const applyPath = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setBusy(true);
    setLoadError(null);
    try {
      await applyCustomLanguageFromPath(trimmed);
      toast.success(t("settings.language.applied"));
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.language.loadFailed");
      setLoadError(message);
      toast.error(t("settings.language.loadFailed"), message);
    } finally {
      setBusy(false);
    }
  };

  const handleBrowserFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setLoadError(null);
    try {
      await applyCustomLanguageFromBrowserFile(file);
      toast.success(t("settings.language.applied"));
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.language.loadFailed");
      setLoadError(message);
      toast.error(t("settings.language.loadFailed"), message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleApplyPaste = async () => {
    setBusy(true);
    setLoadError(null);
    try {
      await applyCustomLanguageFromText(jsonContent);
      toast.success(t("settings.language.applied"));
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.language.loadFailed");
      setLoadError(message);
      toast.error(t("settings.language.loadFailed"), message);
    } finally {
      setBusy(false);
    }
  };

  const handleReload = async () => {
    if (!jsonPath.trim()) return;
    setBusy(true);
    setLoadError(null);
    try {
      await reloadCustomLanguage(jsonPath.trim());
      toast.success(t("settings.language.applied"));
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.language.loadFailed");
      setLoadError(message);
      toast.error(t("settings.language.loadFailed"), message);
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    downloadJson(languagePackTemplateJson(), "pulse-language.en.json");
    toast.success(t("settings.language.exported"));
  };

  const handleClear = async () => {
    setBusy(true);
    setLoadError(null);
    try {
      await clearCustomLanguage();
      toast.success(t("settings.language.removed"));
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("settings.language.clearFailed");
      setLoadError(message);
      toast.error(t("settings.language.clearFailed"), message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium">{t("settings.language.title")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("settings.language.hint")}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {LOCALE_OPTIONS.map((option) => {
            const active = locale === option.id;
            const label =
              option.id === "system"
                ? t("settings.language.system")
                : option.id === "en"
                  ? t("settings.language.en")
                  : t("settings.language.sk");
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setLocale(option.id)}
                className={cn(
                  "relative overflow-hidden rounded-lg border px-2 py-2.5 text-center transition-all",
                  active
                    ? "border-primary ring-2 ring-primary/35"
                    : "border-border/80 hover:border-primary/35",
                )}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {option.id === "system" ? `${option.hint} · ${resolved.toUpperCase()}` : option.hint}
                </span>
                <span className="mt-1 block text-[12px] font-medium leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
        {locale === "system" && (
          <p className="text-xs text-muted-foreground">{t("settings.language.systemHint")}</p>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border/70 bg-muted/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileJson className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("settings.language.customTitle")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("settings.language.customHint")}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {pack
                ? t("settings.language.loaded", {
                    count: keyCount,
                    name: pack.meta.name || jsonPath || "JSON",
                  })
                : t("settings.language.empty")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="custom-language-json-editor">{t("settings.language.paste")}</Label>
          <Textarea
            id="custom-language-json-editor"
            value={jsonContent}
            onChange={(event) => setJsonContent(event.target.value)}
            spellCheck={false}
            disabled={loading || busy}
            placeholder={t("settings.language.pastePlaceholder")}
            className="min-h-[160px] resize-y font-mono text-xs leading-relaxed"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={loading || busy || !jsonContent.trim()}
              onClick={() => void handleApplyPaste()}
            >
              {t("settings.language.apply")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || busy}
              onClick={handleExport}
            >
              <Download className="size-3.5" />
              {t("settings.language.export")}
            </Button>
          </div>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <Label htmlFor="custom-language-json-path">
            {t("settings.language.path")} {isDesktop ? "" : "(browser)"}
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="custom-language-json-path"
              value={jsonPath}
              readOnly={!isDesktop}
              placeholder={isDesktop ? t("settings.language.placeholder") : t("settings.language.noFile")}
              disabled={loading || busy}
              onChange={(event) => {
                if (!isDesktop) return;
                setJsonPath(event.target.value);
              }}
              onKeyDown={(event) => {
                if (!isDesktop || event.key !== "Enter") return;
                event.preventDefault();
                void applyPath(jsonPath);
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
                {t("settings.language.browse")}
              </Button>
              {isDesktop && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || busy || !jsonPath.trim()}
                  onClick={() => void applyPath(jsonPath)}
                >
                  {t("settings.language.load")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || busy || !jsonPath.trim()}
                onClick={() => void handleReload()}
              >
                <RefreshCw className="size-4" />
                {t("settings.language.reload")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || busy || (!jsonPath.trim() && !pack)}
                onClick={() => void handleClear()}
              >
                <Trash2 className="size-4" />
                {t("settings.language.clear")}
              </Button>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => void handleBrowserFile(event.target.files?.[0])}
        />

        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {!isDesktop && (
          <p className="text-xs text-muted-foreground">{t("settings.language.browserHint")}</p>
        )}
      </div>
    </div>
  );
}
