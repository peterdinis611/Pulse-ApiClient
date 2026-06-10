import type { CollectionGroup } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROOT_VALUE = "__root__";

type FolderSelectProps = {
  collectionId: string | null;
  collectionGroups: CollectionGroup[];
  value?: string;
  onChange: (folder: string | undefined) => void;
  className?: string;
  placeholder?: string;
};

export function FolderSelect({
  collectionId,
  collectionGroups,
  value,
  onChange,
  className,
  placeholder = "Folder",
}: FolderSelectProps) {
  const group = collectionGroups.find((item) => item.id === collectionId);
  const folders = group?.folders ?? [];

  return (
    <Select
      value={value ?? ROOT_VALUE}
      onValueChange={(next) => onChange(next === ROOT_VALUE ? undefined : next)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ROOT_VALUE}>No folder</SelectItem>
        {folders.map((folder) => (
          <SelectItem key={folder} value={folder}>
            {folder}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
