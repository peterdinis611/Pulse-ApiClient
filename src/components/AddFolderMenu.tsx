import { useEffect, useState, type ReactNode } from "react";
import { FolderPlus } from "lucide-react";
import { useApp } from "@/machines";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AddFolderMenuProps = {
  collectionId: string;
  collectionName: string;
  folders: string[];
  parentFolder?: string;
  trigger?: ReactNode;
};

export function AddFolderMenu({
  collectionId,
  collectionName,
  folders,
  parentFolder,
  trigger,
}: AddFolderMenuProps) {
  const { addFolder } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState(parentFolder ?? "");

  useEffect(() => {
    if (open) {
      setParent(parentFolder ?? "");
      setName("");
    }
  }, [open, parentFolder]);

  const handleAdd = () => {
    const segment = name.trim().replace(/^\/+|\/+$/g, "");
    if (!segment) {
      toast.error("Enter a folder name");
      return;
    }

    if (segment.includes("/")) {
      toast.error("Use the parent selector for nested folders");
      return;
    }

    const path = parent ? `${parent}/${segment}` : segment;
    addFolder(collectionId, path);
    toast.success("Folder added", path);
    setName("");
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0">
            <FolderPlus className="size-3.5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 space-y-3 p-3"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div>
          <p className="text-sm font-medium">Add folder</p>
          <p className="text-xs text-muted-foreground">{collectionName}</p>
        </div>

        {!parentFolder && (
          <div className="space-y-2">
            <Label htmlFor={`folder-parent-${collectionId}`}>Parent folder</Label>
            <Select value={parent || "__root__"} onValueChange={(value) => setParent(value === "__root__" ? "" : value)}>
              <SelectTrigger id={`folder-parent-${collectionId}`}>
                <SelectValue placeholder="Root level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__root__">Root level</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder} value={folder}>
                    {folder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {parentFolder && (
          <p className="text-xs text-muted-foreground">
            Inside <span className="font-medium text-foreground">{parentFolder}</span>
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor={`folder-name-${collectionId}`}>Folder name</Label>
          <Input
            id={`folder-name-${collectionId}`}
            value={name}
            placeholder={parentFolder ? "OAuth" : "Auth or Auth/OAuth"}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
          />
        </div>

        <Button type="button" size="sm" className="w-full" onClick={handleAdd}>
          <FolderPlus className="size-4" />
          Add folder
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
