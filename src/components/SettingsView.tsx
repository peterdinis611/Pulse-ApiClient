import { useMemo, useRef, useState } from "react";
import { Download, FolderPlus, Moon, Sun, Trash2, Upload } from "lucide-react";
import { APP_NAME } from "@/lib/app-config";
import { useApp } from "@/machines";
import { clearHttpCache } from "@/lib/http-client";
import { requestsForCollection } from "@/lib/collections";
import type { ThemeMode } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const themeOptions: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Sun },
];

export function SettingsView() {
  const {
    theme,
    setTheme,
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
    importCollections,
    importPostmanCollection,
  } = useApp();

  const nativeImportRef = useRef<HTMLInputElement>(null);
  const postmanImportRef = useRef<HTMLInputElement>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);

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

  const handleImport = async (file: File, kind: "pulse" | "postman") => {
    try {
      const raw = await file.text();
      if (kind === "postman") {
        importPostmanCollection(raw);
        setImportMessage(`Imported Postman collection from ${file.name}.`);
      } else {
        importCollections(raw);
        setImportMessage(`Imported ${APP_NAME} collection from ${file.name}.`);
      }
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "Import failed.");
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-4xl space-y-8 p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace preferences, collections, folders, and imports.
          </p>
        </div>

        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <h2 className="text-sm font-semibold">Appearance</h2>
            <p className="text-sm text-muted-foreground">Choose how {APP_NAME} looks on this device.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {themeOptions.map(({ mode, label, icon: Icon }) => (
              <Button
                key={mode}
                type="button"
                variant={theme === mode ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme(mode)}
              >
                <Icon className="size-4" />
                {label}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Collections</h2>
              <p className="text-sm text-muted-foreground">
                Organize saved requests into collections and import from Postman.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => postmanImportRef.current?.click()}>
                <Upload className="size-4" />
                Import Postman
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => nativeImportRef.current?.click()}>
                <Upload className="size-4" />
                Import {APP_NAME} JSON
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
                }}
              >
                <Download className="size-4" />
                Export
              </Button>
            </div>
          </div>

          {importMessage && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {importMessage}
            </p>
          )}

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
            />
            <Button type="button" onClick={handleCreateCollection}>
              Create collection
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
                    "flex items-center gap-2 rounded-md border border-border px-3 py-2",
                    active && "border-primary/30 bg-muted/30",
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    disabled={collectionGroups.length === 1}
                    onClick={() => deleteCollectionGroup(group.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <h2 className="text-sm font-semibold">Folders</h2>
            <p className="text-sm text-muted-foreground">
              Manage folders inside the active collection. Use nested paths like{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">Auth/OAuth</code>.
            </p>
          </div>

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
              placeholder="Folder or nested path"
            />
            <Button type="button" variant="outline" onClick={handleAddFolder}>
              <FolderPlus className="size-4" />
              Add folder
            </Button>
          </div>

          {activeCollection && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {collectionRequestCount} requests in {activeCollection.name}
              </p>
              {activeCollection.folders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No folders yet.</p>
              ) : (
                activeCollection.folders.map((folder) => (
                  <div
                    key={folder}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <span className="text-sm">{folder}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() => deleteFolder(activeCollection.id, folder)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <h2 className="text-sm font-semibold">Data</h2>
            <p className="text-sm text-muted-foreground">Maintenance actions for local workspace data.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void clearHttpCache()}>
            Clear HTTP cache
          </Button>
        </section>

        <Separator />
      </div>
    </ScrollArea>
  );
}
