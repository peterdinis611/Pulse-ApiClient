import type { KeyValue } from "@/types";
import { Trash2 } from "lucide-react";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type KeyValueEditorProps = {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
};

export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KeyValueEditorProps) {
  const updateRow = (id: string, patch: Partial<KeyValue>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    onChange([...rows, { id: crypto.randomUUID(), key: "", value: "", enabled: true }]);
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) {
      onChange([{ id: rows[0].id, key: "", value: "", enabled: true }]);
      return;
    }
    onChange(rows.filter((row) => row.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span />
        <span>Key</span>
        <span>Value</span>
        <span />
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className={cn(
            "grid grid-cols-[32px_1fr_1fr_32px] items-center gap-2 rounded-md p-1 hover:bg-muted/50",
            !row.enabled && "opacity-50",
          )}
        >
          <Checkbox
            checked={row.enabled}
            onCheckedChange={(checked) => updateRow(row.id, { enabled: checked === true })}
            aria-label="Enable row"
          />
          <Input
            value={row.key}
            placeholder={keyPlaceholder}
            onChange={(event) => updateRow(row.id, { key: event.target.value })}
          />
          <Input
            value={row.value}
            placeholder={valuePlaceholder}
            onChange={(event) => updateRow(row.id, { value: event.target.value })}
          />
          <TooltipIconButton
            variant="ghost"
            size="icon"
            className="size-8"
            label="Remove row"
            onClick={() => removeRow(row.id)}
          >
            <Trash2 className="size-4" />
          </TooltipIconButton>
        </div>
      ))}
      <Button type="button" variant="link" className="h-auto px-1" onClick={addRow}>
        + Add row
      </Button>
    </div>
  );
}
