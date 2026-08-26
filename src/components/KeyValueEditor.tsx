import { useRef } from "react";
import type { Environment, KeyValue } from "@/types";
import { Trash2 } from "lucide-react";
import { VariableField } from "@/components/VariableField";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { createKeyValue, ensureTrailingBlankKeyValue, isKeyValueBlank } from "@/lib/helpers";
import { cn } from "@/lib/utils";

type KeyValueEditorProps = {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  environment?: Environment | null;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
};

export function KeyValueEditor({
  rows,
  onChange,
  environment = null,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KeyValueEditorProps) {
  const extraBlankRef = useRef<KeyValue | null>(null);
  const last = rows[rows.length - 1];
  const needsExtra = !last || !isKeyValueBlank(last);
  if (needsExtra) {
    extraBlankRef.current ??= createKeyValue();
  } else {
    extraBlankRef.current = null;
  }
  const displayRows =
    needsExtra && extraBlankRef.current ? [...rows, extraBlankRef.current] : rows;

  const commit = (next: KeyValue[]) => {
    onChange(ensureTrailingBlankKeyValue(next));
  };

  const updateRow = (id: string, patch: Partial<KeyValue>) => {
    commit(displayRows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    commit([...displayRows, createKeyValue()]);
  };

  const removeRow = (id: string) => {
    if (displayRows.length <= 1) {
      commit([createKeyValue({ id: displayRows[0]?.id })]);
      return;
    }
    commit(displayRows.filter((row) => row.id !== id));
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span />
        <span>Key</span>
        <span>Value</span>
        <span />
      </div>
      {displayRows.map((row, index) => {
        const trailingBlank = index === displayRows.length - 1 && isKeyValueBlank(row);
        return (
          <div
            key={row.id}
            className={cn(
              "grid grid-cols-[32px_1fr_1fr_32px] items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50",
              !row.enabled && "opacity-50",
            )}
          >
            <Checkbox
              checked={row.enabled}
              onCheckedChange={(checked) => updateRow(row.id, { enabled: checked === true })}
              aria-label="Enable row"
            />
            <VariableField
              embedded
              environment={environment}
              value={row.key}
              placeholder={keyPlaceholder}
              onChange={(key) => updateRow(row.id, { key })}
            />
            <VariableField
              embedded
              environment={environment}
              value={row.value}
              placeholder={valuePlaceholder}
              onChange={(value) => updateRow(row.id, { value })}
            />
            <TooltipIconButton
              variant="ghost"
              size="icon"
              className={cn(
                "size-8",
                trailingBlank && displayRows.length > 1 && "pointer-events-none opacity-0",
              )}
              label="Remove row"
              disabled={trailingBlank && displayRows.length > 1}
              onClick={() => removeRow(row.id)}
            >
              <Trash2 className="size-4" />
            </TooltipIconButton>
          </div>
        );
      })}
      <Button type="button" variant="link" className="h-auto px-1" onClick={addRow}>
        + Add row
      </Button>
    </div>
  );
}
