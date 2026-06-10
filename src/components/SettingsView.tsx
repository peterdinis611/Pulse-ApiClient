import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Cookie,
  Database,
  Download,
  FolderPlus,
  Gauge,
  History,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { APP_NAME } from "@/lib/app-config";
import { useApp } from "@/machines";
import { dbGetDatabasePath, dbResetDatabase } from "@/lib/db-client";
import {
  clearHttpCache,
  clearHttpCookies,
  getAppSettings,
  getHttpCookies,
  getHttpEngineStats,
  setHttpSettings,
  type StoredCookie,
} from "@/lib/http-client";
import { canUseTauriIpc } from "@/lib/tauri-runtime";
import { clearLegacyPersistedState, defaultPersistedState, savePersistedState } from "@/lib/storage";
import { toast } from "@/lib/toast";
import { requestsForCollection } from "@/lib/collections";
import type { ThemeMode } from "@/lib/theme";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const themeOptions: { mode: ThemeMode; label: string; description: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", description: "Bright surfaces", icon: Sun },
  { mode: "dark", label: "Dark", description: "Low-light friendly", icon: Moon },
  { mode: "system", label: "System", description: "Match OS setting", icon: Monitor },
];

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  action,
}: {
  icon: typeof Sun;
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-border/70 bg-muted/20 px-5 py-4">
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-4 p-5">{children}</div>
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
        "flex flex-col gap-3 rounded-lg border border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between",
        danger && "border-destructive/30 bg-destructive/5",
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
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function SettingsView() {
  const {
    theme,
    setTheme,
    sidebarPosition,
    sidebarCollapsed,
    setSidebarPosition,
    setSidebarCollapsed,
    mainView,
    windowId,
    collectionGroups,
    activeCollectionId,
    collections,
    history,
    setActiveCollectionId,
    addCollectionGroup,
    deleteCollectionGroup,
    renameCollectionGroup,
    addFolder,
    deleteFolder,
    exportCollections,
    importCollections,
    importPostmanCollection,
    importOpenApiCollection,
    clearHistory,
    resetWorkspace,
  } = useApp();

  const nativeImportRef = useRef<HTMLInputElement>(null);
  const postmanImportRef = useRef<HTMLInputElement>(null);
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
  const [resettingDb, setResettingDb] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cookies, setCookies] = useState<StoredCookie[]>([]);
  const [clearingCookies, setClearingCookies] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const tasks: Promise<void>[] = [
          getAppSettings().then((settings) => {
            if (cancelled) return;
            setHttpMaxConcurrent(String(settings.httpMaxConcurrent));
            setHttpTimeoutSec(String(Math.round(settings.httpTimeoutMs / 1000)));
            setHttpCacheEnabled(settings.httpCacheEnabled);
            setHttpCacheTtlMin(String(Math.round(settings.httpCacheTtlSec / 60)));
            setHttpCacheDiskEnabled(settings.httpCacheDiskEnabled);
          }),
          getHttpEngineStats().then((stats) => {
            if (!cancelled) setEngineStats(stats);
          }),
          getHttpCookies().then((items) => {
            if (!cancelled) setCookies(items);
          }),
        ];

        if (canUseTauriIpc()) {
          tasks.push(
            dbGetDatabasePath().then((path) => {
              if (!cancelled) setDatabasePath(path);
            }),
          );
        }

        await Promise.all(tasks);
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

  const handleImport = async (file: File, kind: "pulse" | "postman" | "openapi") => {
    try {
      const raw = await file.text();
      if (kind === "postman") {
        importPostmanCollection(raw);
        toast.success("Postman collection imported", file.name);
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

  const handleClearCookies = async () => {
    setClearingCookies(true);
    try {
      await clearHttpCookies();
      setCookies([]);
      toast.success("Cookie jar cleared");
    } catch {
      toast.error("Failed to clear cookies");
    } finally {
      setClearingCookies(false);
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
    <ScrollAreaWithTop className="h-full" resetKey={mainView}>
      <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Appearance, workspace data, collections, and HTTP engine preferences.
          </p>
        </div>

        <SettingsSection
          icon={Sun}
          title="Appearance"
          description={`Choose how ${APP_NAME} looks on this device.`}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {themeOptions.map(({ mode, label, description, icon: Icon }) => {
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30 hover:bg-muted/30",
                  )}
                >
                  <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
                  <p className="mt-3 text-sm font-medium">{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                </button>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection
          icon={Database}
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
            description={`Remove ${history.length} saved history ${history.length === 1 ? "entry" : "entries"} from the workspace.`}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={history.length === 0}
              onClick={() => {
                clearHistory();
                toast.success("History cleared");
              }}
            >
              <History className="size-4" />
              Clear history
            </Button>
          </SettingRow>

          <SettingRow
            title="Reset database"
            description="Delete pulse.db and recreate an empty database. Removes collections, environments, accounts, sessions, and cache."
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
          icon={Gauge}
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
          icon={PanelLeft}
          title="Layout"
          description="Sidebar position, width, and collapse behavior."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSidebarPosition("left")}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                sidebarPosition === "left"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-primary/30 hover:bg-muted/30",
              )}
            >
              <PanelLeft className="size-4 text-primary" />
              <p className="mt-3 text-sm font-medium">Sidebar on left</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Default explorer layout</p>
            </button>
            <button
              type="button"
              onClick={() => setSidebarPosition("right")}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                sidebarPosition === "right"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-primary/30 hover:bg-muted/30",
              )}
            >
              <PanelRight className="size-4 text-primary" />
              <p className="mt-3 text-sm font-medium">Sidebar on right</p>
              <p className="mt-0.5 text-xs text-muted-foreground">More room for request editor</p>
            </button>
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-border/70 p-4 text-sm">
            <Checkbox
              checked={sidebarCollapsed}
              onCheckedChange={(checked) => setSidebarCollapsed(checked === true)}
            />
            <div>
              <p className="font-medium">Start with collapsed sidebar</p>
              <p className="text-xs text-muted-foreground">
                Show icon rail only. Toggle anytime with ⌘B or the layout menu.
              </p>
            </div>
          </label>
        </SettingsSection>

        <SettingsSection
          icon={Cookie}
          title="Cookie jar"
          description="Cookies received from HTTP responses are stored automatically and sent on matching requests."
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
          {cookies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cookies stored yet. Send a request that returns Set-Cookie headers.
            </p>
          ) : (
            <div className="space-y-2">
              {cookies.map((cookie) => (
                <div
                  key={`${cookie.url}-${cookie.name}`}
                  className="rounded-lg border border-border/70 px-3 py-2 font-mono text-xs"
                >
                  <p className="font-semibold text-foreground">{cookie.name}</p>
                  <p className="mt-1 break-all text-muted-foreground">{cookie.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{cookie.url}</p>
                </div>
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          icon={FolderPlus}
          title="Collections"
          description="Organize saved requests and import from Postman or OpenAPI."
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
              <Button type="button" variant="outline" size="sm" onClick={() => nativeImportRef.current?.click()}>
                <Upload className="size-4" />
                {APP_NAME}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const blob = new Blob([exportCollections()], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = "pulse-collections.json";
                  anchor.click();
                  URL.revokeObjectURL(url);
                  toast.success("Collections exported");
                }}
              >
                <Download className="size-4" />
                Export
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
                  <TooltipIconButton
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    label="Delete collection"
                    disabled={collectionGroups.length === 1}
                    onClick={() => deleteCollectionGroup(group.id)}
                  >
                    <Trash2 className="size-4" />
                  </TooltipIconButton>
                </div>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection
          icon={FolderPlus}
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
                      onClick={() => deleteFolder(activeCollection.id, folder)}
                    >
                      <Trash2 className="size-4" />
                    </TooltipIconButton>
                  </div>
                ))
              )}
            </div>
          )}
        </SettingsSection>

        <Separator />
      </div>
    </ScrollAreaWithTop>
  );
}
