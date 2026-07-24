import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Download,
  FolderPlus,
  History,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { APP_NAME } from "@/lib/app-config";
import { useApp } from "@/machines";
import { dbGetDatabasePath, dbResetDatabase } from "@/lib/db-client";
import {
  clearHttpCache,
  clearHttpCookies,
  deleteHttpCookie,
  getHttpEngineStats,
  loadHttpSettingsDashboard,
  setHttpCookie,
  setHttpSettings,
  type StoredCookie,
} from "@/lib/http-client";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { clearLegacyPersistedState, defaultPersistedState, savePersistedState } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { requestsForCollection } from "@/lib/collections";
import { downloadJson } from "@/lib/download";
import { ThemePicker } from "@/components/ThemePicker";
import { CustomThemeSettings } from "@/components/CustomThemeSettings";
import { CollectionExportMenu } from "@/components/CollectionExportMenu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useHistory } from "@/hooks/useHistory";
import { emitWorkspaceReset } from "@/lib/workspace-sync";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function SettingsSection({
  id,
  title,
  description,
  children,
  action,
}: {
  id?: string;
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 space-y-4 border-b border-border pb-8 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-title">{title}</h2>
          <p className="mt-1 text-body text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
  danger,
}: {
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border/60 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between",
        danger && "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/60 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium tabular-nums">{value}</p>
    </div>
  );
}

const SETTINGS_NAV = [
  { id: "appearance", label: "Appearance" },
  { id: "data", label: "Data & storage" },
  { id: "http", label: "HTTP engine" },
  { id: "layout", label: "Layout" },
  { id: "cookies", label: "Cookie jar" },
  { id: "collections", label: "Collections" },
  { id: "folders", label: "Folders" },
] as const;

function SettingsNav({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="space-y-0.5" aria-label="Settings sections">
      {SETTINGS_NAV.map((item) => (
        <button
          key={item.id}
          type="button"
          className={cn(
            "w-full rounded-md px-3 py-2 text-left text-[13px] transition-colors",
            activeId === item.id
              ? "bg-accent font-medium text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function SettingsView() {
  const {
    theme,
    setTheme,
    explorerCollapsed,
    setExplorerCollapsed,
    mainView,
    windowId,
    collectionGroups,
    activeCollectionId,
    collections,
    setActiveCollectionId,
    addCollectionGroup,
    deleteCollectionGroup,
    renameCollectionGroup,
    addFolder,
    deleteFolder,
    exportCollections,
    exportCollection,
    importCollections,
    importPostmanCollection,
    importBrunoCollection,
    importInsomniaCollection,
    importOpenApiCollection,
    clearHistory,
    resetWorkspace,
  } = useApp();

  const { totalCount: historyCount } = useHistory();

  const nativeImportRef = useRef<HTMLInputElement>(null);
  const postmanImportRef = useRef<HTMLInputElement>(null);
  const brunoImportRef = useRef<HTMLInputElement>(null);
  const insomniaImportRef = useRef<HTMLInputElement>(null);
  const openApiImportRef = useRef<HTMLInputElement>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [httpMaxConcurrent, setHttpMaxConcurrent] = useState("32");
  const [httpTimeoutSec, setHttpTimeoutSec] = useState("30");
  const [httpCacheEnabled, setHttpCacheEnabled] = useState(true);
  const [httpCacheTtlMin, setHttpCacheTtlMin] = useState("15");
  const [httpCacheDiskEnabled, setHttpCacheDiskEnabled] = useState(true);
  const [engineStats, setEngineStats] = useState<Awaited<ReturnType<typeof getHttpEngineStats>> | null>(
    null,
  );
  const [databasePath, setDatabasePath] = useState<string | null>(null);
  const [confirmResetDb, setConfirmResetDb] = useState(false);
  const [pendingDeleteCollection, setPendingDeleteCollection] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<{
    collectionId: string;
    path: string;
  } | null>(null);
  const [resettingDb, setResettingDb] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cookies, setCookies] = useState<StoredCookie[]>([]);
  const [clearingCookies, setClearingCookies] = useState(false);
  const [savingCookie, setSavingCookie] = useState(false);
  const [cookieForm, setCookieForm] = useState({
    name: "",
    value: "",
    url: "https://",
    domain: "",
    path: "/",
  });
  const [editingCookieKey, setEditingCookieKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>(SETTINGS_NAV[0].id);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [{ settings, stats, cookies }, databasePath] = await Promise.all([
          loadHttpSettingsDashboard(),
          canUseTauriIpc() ? dbGetDatabasePath() : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setHttpMaxConcurrent(String(settings.httpMaxConcurrent));
        setHttpTimeoutSec(String(Math.round(settings.httpTimeoutMs / 1000)));
        setHttpCacheEnabled(settings.httpCacheEnabled);
        setHttpCacheTtlMin(String(Math.round(settings.httpCacheTtlSec / 60)));
        setHttpCacheDiskEnabled(settings.httpCacheDiskEnabled);
        setEngineStats(stats);
        setCookies(cookies);
        setDatabasePath(databasePath);
      } catch {
        toast.error("Could not load settings");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCollection = useMemo(
    () => collectionGroups.find((group) => group.id === activeCollectionId) ?? collectionGroups[0],
    [activeCollectionId, collectionGroups],
  );

  const collectionRequestCount = useMemo(() => {
    if (!activeCollection) return 0;
    return requestsForCollection(collections, activeCollection.id).length;
  }, [activeCollection, collections]);

  const handleCreateCollection = () => {
    const name = newCollectionName.trim();
    if (!name) return;
    addCollectionGroup(name);
    setNewCollectionName("");
  };

  const handleAddFolder = () => {
    if (!activeCollection) return;
    const folderPath = newFolderName.trim();
    if (!folderPath) return;
    addFolder(activeCollection.id, folderPath);
    setNewFolderName("");
  };

  const handleSaveHttpSettings = async () => {
    const maxConcurrent = Number.parseInt(httpMaxConcurrent, 10);
    const timeoutSec = Number.parseInt(httpTimeoutSec, 10);
    const cacheTtlMin = Number.parseInt(httpCacheTtlMin, 10);
    if (!Number.isFinite(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 256) {
      toast.error("Invalid value", "Concurrent requests must be between 1 and 256.");
      return;
    }
    if (!Number.isFinite(timeoutSec) || timeoutSec < 1 || timeoutSec > 600) {
      toast.error("Invalid value", "Timeout must be between 1 and 600 seconds.");
      return;
    }
    if (!Number.isFinite(cacheTtlMin) || cacheTtlMin < 1 || cacheTtlMin > 1440) {
      toast.error("Invalid value", "Cache TTL must be between 1 and 1440 minutes.");
      return;
    }

    try {
      const saved = await setHttpSettings(
        maxConcurrent,
        timeoutSec * 1000,
        httpCacheEnabled,
        cacheTtlMin * 60,
        httpCacheDiskEnabled,
      );
      setHttpMaxConcurrent(String(saved.httpMaxConcurrent));
      setHttpTimeoutSec(String(Math.round(saved.httpTimeoutMs / 1000)));
      setHttpCacheEnabled(saved.httpCacheEnabled);
      setHttpCacheTtlMin(String(Math.round(saved.httpCacheTtlSec / 60)));
      setHttpCacheDiskEnabled(saved.httpCacheDiskEnabled);
      setEngineStats(await getHttpEngineStats());
      toast.success("HTTP settings saved");
    } catch {
      toast.error("Failed to save HTTP settings");
    }
  };

  const handleImport = async (
    file: File,
    kind: "pulse" | "postman" | "bruno" | "insomnia" | "openapi",
  ) => {
    try {
      const raw = await file.text();
      if (kind === "postman") {
        importPostmanCollection(raw);
        toast.success("Postman collection imported", file.name);
      } else if (kind === "bruno") {
        importBrunoCollection(raw);
        toast.success("Bruno collection imported", file.name);
      } else if (kind === "insomnia") {
        importInsomniaCollection(raw);
        toast.success("Insomnia export imported", file.name);
      } else if (kind === "openapi") {
        importOpenApiCollection(raw);
        toast.success("OpenAPI collection imported", file.name);
      } else {
        importCollections(raw);
        toast.success(`${APP_NAME} collection imported`, file.name);
      }
    } catch (error) {
      toast.error(
        "Import failed",
        error instanceof Error ? error.message : "Could not import file.",
      );
    }
  };

  const resetCookieForm = () => {
    setCookieForm({
      name: "",
      value: "",
      url: "https://",
      domain: "",
      path: "/",
    });
    setEditingCookieKey(null);
  };

  const handleClearCookies = async () => {
    setClearingCookies(true);
    try {
      await clearHttpCookies();
      setCookies([]);
      resetCookieForm();
      toast.success("Cookie jar cleared");
    } catch {
      toast.error("Failed to clear cookies");
    } finally {
      setClearingCookies(false);
    }
  };

  const handleEditCookie = (cookie: StoredCookie) => {
    setEditingCookieKey(`${cookie.url}\0${cookie.name}`);
    setCookieForm({
      name: cookie.name,
      value: cookie.value,
      url: cookie.url,
      domain: cookie.domain ?? "",
      path: cookie.path ?? "/",
    });
  };

  const handleSaveCookie = async () => {
    const name = cookieForm.name.trim();
    const url = cookieForm.url.trim();
    if (!name || !url) {
      toast.error("Name and URL are required");
      return;
    }

    setSavingCookie(true);
    try {
      if (
        editingCookieKey &&
        editingCookieKey !== `${url}\0${name}`
      ) {
        const [previousUrl, previousName] = editingCookieKey.split("\0");
        if (previousUrl && previousName) {
          await deleteHttpCookie(previousName, previousUrl);
        }
      }

      const next = await setHttpCookie({
        name,
        value: cookieForm.value,
        url,
        domain: cookieForm.domain.trim() || null,
        path: cookieForm.path.trim() || "/",
      });
      setCookies(next);
      resetCookieForm();
      toast.success(editingCookieKey ? "Cookie updated" : "Cookie saved");
    } catch (error) {
      toast.error(
        "Failed to save cookie",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setSavingCookie(false);
    }
  };

  const handleDeleteCookie = async (cookie: StoredCookie) => {
    try {
      const next = await deleteHttpCookie(cookie.name, cookie.url);
      setCookies(next);
      if (editingCookieKey === `${cookie.url}\0${cookie.name}`) {
        resetCookieForm();
      }
      toast.success("Cookie deleted");
    } catch (error) {
      toast.error(
        "Failed to delete cookie",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const cleared = await clearHttpCache();
      setEngineStats(await getHttpEngineStats());
      toast.success("HTTP cache cleared", `${cleared} entries removed`);
    } catch {
      toast.error("Failed to clear cache");
    } finally {
      setClearingCache(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!canUseTauriIpc()) {
      toast.error("Database reset is only available in the desktop app");
      return;
    }

    setResettingDb(true);
    try {
      await dbResetDatabase();
      clearLegacyPersistedState();
      const fresh = defaultPersistedState();
      await savePersistedState(fresh, { sourceWindowId: windowId, broadcast: false });
      resetWorkspace();
      await emitWorkspaceReset(windowId);
      setEngineStats(await getHttpEngineStats());
      setConfirmResetDb(false);
      toast.success("Database recreated", "Workspace restored to defaults");
    } catch {
      toast.error("Failed to reset database");
    } finally {
      setResettingDb(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-52 shrink-0 border-r border-border bg-surface-1/60 md:flex md:flex-col">
        <div className="border-b border-border/60 px-4 py-4">
          <p className="text-caption">Sections</p>
        </div>
        <div className="p-3">
          <SettingsNav activeId={activeSection} onSelect={scrollToSection} />
        </div>
      </aside>
      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={mainView}>
        <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-6 sm:px-6">
        <SettingsSection
          id="appearance"
          title="Appearance"
          description={`Choose how ${APP_NAME} looks on this device.`}
        >
          <ThemePicker value={theme} onChange={setTheme} />
          <CustomThemeSettings />
        </SettingsSection>

        <SettingsSection
          id="data"
          title="Data & storage"
          description="Local SQLite database, cache, and request history."
        >
          {databasePath && (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Database path
              </p>
              <p className="mt-1 break-all font-mono text-xs text-foreground/90">{databasePath}</p>
            </div>
          )}

          <SettingRow
            title="Clear HTTP cache"
            description="Remove cached GET/HEAD responses from memory and disk."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={clearingCache}
              onClick={() => void handleClearCache()}
            >
              <Trash2 className="size-4" />
              {clearingCache ? "Clearing…" : "Clear cache"}
            </Button>
          </SettingRow>

          <SettingRow
            title="Clear request history"
            description={`Remove ${historyCount} saved history ${historyCount === 1 ? "entry" : "entries"} from the workspace.`}
          >
            <ConfirmDialog
              title="Clear history?"
              description={
                historyCount === 1
                  ? "This will permanently remove 1 history entry."
                  : `This will permanently remove ${historyCount} history entries.`
              }
              confirmLabel="Clear history"
              disabled={historyCount === 0}
              trigger={
                <Button type="button" variant="outline" size="sm" disabled={historyCount === 0}>
                  <History className="size-4" />
                  Clear history
                </Button>
              }
              onConfirm={() => {
                clearHistory();
                toast.success("History cleared");
              }}
            />
          </SettingRow>

          <SettingRow
            title="Reset database"
            description="Delete your workspace database and recreate it empty. Removes your collections, environments, history, and HTTP cache. Your account stays signed in."
            danger
          >
            {!confirmResetDb ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!canUseTauriIpc()}
                onClick={() => setConfirmResetDb(true)}
              >
                <AlertTriangle className="size-4" />
                Reset database
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={resettingDb}
                  onClick={() => setConfirmResetDb(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={resettingDb}
                  onClick={() => void handleResetDatabase()}
                >
                  {resettingDb ? "Resetting…" : "Confirm reset"}
                </Button>
              </>
            )}
          </SettingRow>
        </SettingsSection>

        <SettingsSection
          id="http"
          title="HTTP engine"
          description="Concurrency, timeouts, and response caching."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="http-max-concurrent">Max concurrent requests</Label>
              <Input
                id="http-max-concurrent"
                type="number"
                min={1}
                max={256}
                value={httpMaxConcurrent}
                onChange={(event) => setHttpMaxConcurrent(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="http-timeout">Request timeout (seconds)</Label>
              <Input
                id="http-timeout"
                type="number"
                min={1}
                max={600}
                value={httpTimeoutSec}
                onChange={(event) => setHttpTimeoutSec(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border/70 bg-muted/10 p-4">
            <div>
              <h3 className="text-sm font-medium">Response cache</h3>
              <p className="text-sm text-muted-foreground">
                GET/HEAD responses are cached in memory and on disk for faster repeat requests.
              </p>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={httpCacheEnabled}
                onCheckedChange={(checked) => setHttpCacheEnabled(checked === true)}
              />
              Enable response cache
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="http-cache-ttl">Default cache TTL (minutes)</Label>
                <Input
                  id="http-cache-ttl"
                  type="number"
                  min={1}
                  max={1440}
                  value={httpCacheTtlMin}
                  disabled={!httpCacheEnabled}
                  onChange={(event) => setHttpCacheTtlMin(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={httpCacheDiskEnabled}
                disabled={!httpCacheEnabled}
                onCheckedChange={(checked) => setHttpCacheDiskEnabled(checked === true)}
              />
              Persist cache to disk (survives app restart)
            </label>
          </div>

          {engineStats && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatPill label="Active" value={engineStats.activeRequests} />
              <StatPill label="Completed" value={engineStats.totalCompleted} />
              <StatPill label="Failed" value={engineStats.totalFailed} />
              <StatPill label="Cache hits" value={engineStats.cacheHits} />
              <StatPill label="Memory cache" value={engineStats.cacheMemoryEntries} />
              <StatPill label="Disk cache" value={engineStats.cacheDiskEntries} />
            </div>
          )}

          <Button type="button" onClick={() => void handleSaveHttpSettings()}>
            Save HTTP settings
          </Button>
        </SettingsSection>

        <SettingsSection
          id="layout"
          title="Layout"
          description="Explorer panel visibility and keyboard shortcuts."
        >
          <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
            <Checkbox
              checked={explorerCollapsed}
              onCheckedChange={(checked) => setExplorerCollapsed(checked === true)}
            />
            <div>
              <p className="font-medium">Start with explorer hidden</p>
              <p className="text-xs text-muted-foreground">
                Show icon rail only in request view. Toggle with ⌘B or the panel button in the rail.
              </p>
            </div>
          </label>
        </SettingsSection>

        <SettingsSection
          id="cookies"
          title="Cookie jar"
          description="Cookies from Set-Cookie responses are stored automatically. You can also add, edit, or delete them — they are sent on matching requests."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={clearingCookies || cookies.length === 0}
              onClick={() => void handleClearCookies()}
            >
              {clearingCookies ? "Clearing…" : "Clear cookies"}
            </Button>
          }
        >
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {editingCookieKey ? "Edit cookie" : "Add cookie"}
              </p>
              {editingCookieKey && (
                <Button type="button" variant="ghost" size="sm" onClick={resetCookieForm}>
                  Cancel
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cookie-name">Name</Label>
                <Input
                  id="cookie-name"
                  value={cookieForm.name}
                  onChange={(event) =>
                    setCookieForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="session"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cookie-value">Value</Label>
                <Input
                  id="cookie-value"
                  value={cookieForm.value}
                  onChange={(event) =>
                    setCookieForm((current) => ({ ...current, value: event.target.value }))
                  }
                  placeholder="abc123"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cookie-url">URL</Label>
                <Input
                  id="cookie-url"
                  value={cookieForm.url}
                  onChange={(event) =>
                    setCookieForm((current) => ({ ...current, url: event.target.value }))
                  }
                  placeholder="https://api.example.com"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cookie-domain">Domain (optional)</Label>
                <Input
                  id="cookie-domain"
                  value={cookieForm.domain}
                  onChange={(event) =>
                    setCookieForm((current) => ({ ...current, domain: event.target.value }))
                  }
                  placeholder=".example.com"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cookie-path">Path</Label>
                <Input
                  id="cookie-path"
                  value={cookieForm.path}
                  onChange={(event) =>
                    setCookieForm((current) => ({ ...current, path: event.target.value }))
                  }
                  placeholder="/"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={savingCookie || !canUseTauriIpc()}
                onClick={() => void handleSaveCookie()}
              >
                <Plus className="size-3.5" />
                {savingCookie ? "Saving…" : editingCookieKey ? "Update cookie" : "Add cookie"}
              </Button>
            </div>
            {!canUseTauriIpc() && (
              <p className="text-xs text-muted-foreground">
                Cookie jar editing requires the desktop app.
              </p>
            )}
          </div>

          {cookies.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No cookies stored yet. Send a request that returns Set-Cookie headers, or add one above.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {cookies.map((cookie) => (
                <div
                  key={`${cookie.url}-${cookie.name}`}
                  className="flex items-start gap-2 rounded-lg border border-border/70 px-3 py-2 font-mono text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{cookie.name}</p>
                    <p className="mt-1 break-all text-muted-foreground">{cookie.value}</p>
                    <p className="mt-1 break-all text-[11px] text-muted-foreground">{cookie.url}</p>
                    {(cookie.domain || cookie.path) && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {[cookie.domain ? `domain=${cookie.domain}` : null, cookie.path ? `path=${cookie.path}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <TooltipIconButton
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      label="Edit cookie"
                      onClick={() => handleEditCookie(cookie)}
                    >
                      <Pencil className="size-3.5" />
                    </TooltipIconButton>
                    <TooltipIconButton
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      label="Delete cookie"
                      onClick={() => void handleDeleteCookie(cookie)}
                    >
                      <Trash2 className="size-3.5" />
                    </TooltipIconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          id="collections"
          title="Collections"
          description="Organize saved requests and import from Postman, Bruno, Insomnia, or OpenAPI."
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => openApiImportRef.current?.click()}>
                <Upload className="size-4" />
                OpenAPI
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => postmanImportRef.current?.click()}>
                <Upload className="size-4" />
                Postman
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => brunoImportRef.current?.click()}>
                <Upload className="size-4" />
                Bruno
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => insomniaImportRef.current?.click()}>
                <Upload className="size-4" />
                Insomnia
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => nativeImportRef.current?.click()}>
                <Upload className="size-4" />
                {APP_NAME}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  downloadJson(exportCollections(), "pulse-collections.json");
                  toast.success("All collections exported");
                }}
              >
                <Download className="size-4" />
                Export all
              </Button>
            </div>
          }
        >
          <input
            ref={openApiImportRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleImport(file, "openapi");
              event.target.value = "";
            }}
          />
          <input
            ref={postmanImportRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleImport(file, "postman");
              event.target.value = "";
            }}
          />
          <input
            ref={brunoImportRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleImport(file, "bruno");
              event.target.value = "";
            }}
          />
          <input
            ref={insomniaImportRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleImport(file, "insomnia");
              event.target.value = "";
            }}
          />
          <input
            ref={nativeImportRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleImport(file, "pulse");
              event.target.value = "";
            }}
          />

          <div className="flex gap-2">
            <Input
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              placeholder="New collection name"
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreateCollection();
              }}
            />
            <Button type="button" onClick={handleCreateCollection}>
              Create
            </Button>
          </div>

          <div className="space-y-2">
            {collectionGroups.map((group) => {
              const count = requestsForCollection(collections, group.id).length;
              const active = group.id === activeCollectionId;
              return (
                <div
                  key={group.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
                    active ? "border-primary/30 bg-primary/5" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setActiveCollectionId(group.id)}
                  >
                    <p className="truncate text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {count} requests · {group.source === "postman" ? "Postman" : APP_NAME}
                    </p>
                  </button>
                  <Input
                    defaultValue={group.name}
                    className="h-8 max-w-[180px]"
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== group.name) {
                        renameCollectionGroup(group.id, next);
                      }
                    }}
                  />
                  <CollectionExportMenu
                    collectionId={group.id}
                    collectionName={group.name}
                    exportCollection={exportCollection}
                    className="size-8 shrink-0"
                  />
                  <TooltipIconButton
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    label="Delete collection"
                    disabled={collectionGroups.length === 1}
                    onClick={() =>
                      setPendingDeleteCollection({ id: group.id, name: group.name })
                    }
                  >
                    <Trash2 className="size-4" />
                  </TooltipIconButton>
                </div>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection
          id="folders"
          title="Folders"
          description="Manage folders inside the active collection."
        >
          <div className="max-w-xs space-y-2">
            <Label htmlFor="settings-active-collection">Active collection</Label>
            <Select
              value={activeCollection?.id}
              onValueChange={(value) => setActiveCollectionId(value)}
            >
              <SelectTrigger id="settings-active-collection">
                <SelectValue placeholder="Select collection" />
              </SelectTrigger>
              <SelectContent>
                {collectionGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="Folder or nested path (e.g. Auth/OAuth)"
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAddFolder();
              }}
            />
            <Button type="button" variant="outline" onClick={handleAddFolder}>
              <FolderPlus className="size-4" />
              Add
            </Button>
          </div>

          {activeCollection && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {collectionRequestCount} requests in {activeCollection.name}
              </p>
              {activeCollection.folders.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  No folders yet. Add one above to organize requests.
                </p>
              ) : (
                activeCollection.folders.map((folder) => (
                  <div
                    key={folder}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-sm">{folder}</span>
                    <TooltipIconButton
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      label="Delete folder"
                      onClick={() =>
                        setPendingDeleteFolder({
                          collectionId: activeCollection.id,
                          path: folder,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </TooltipIconButton>
                  </div>
                ))
              )}
            </div>
          )}
        </SettingsSection>

      </div>
      </ScrollAreaWithTop>

      <ConfirmDialog
        open={pendingDeleteCollection !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteCollection(null);
        }}
        title="Delete collection?"
        description={
          pendingDeleteCollection
            ? `“${pendingDeleteCollection.name}” and all of its requests will be permanently removed.`
            : "This collection will be permanently removed."
        }
        confirmLabel="Delete collection"
        onConfirm={() => {
          if (pendingDeleteCollection) {
            deleteCollectionGroup(pendingDeleteCollection.id);
            toast.success("Collection deleted", pendingDeleteCollection.name);
          }
          setPendingDeleteCollection(null);
        }}
      />

      <ConfirmDialog
        open={pendingDeleteFolder !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteFolder(null);
        }}
        title="Delete folder?"
        description={
          pendingDeleteFolder
            ? `Folder “${pendingDeleteFolder.path}” will be removed.`
            : "This folder will be removed."
        }
        confirmLabel="Delete folder"
        onConfirm={() => {
          if (pendingDeleteFolder) {
            deleteFolder(pendingDeleteFolder.collectionId, pendingDeleteFolder.path);
            toast.success("Folder deleted", pendingDeleteFolder.path);
          }
          setPendingDeleteFolder(null);
        }}
      />
    </div>
  );
}
