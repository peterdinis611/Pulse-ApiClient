import { useRef } from "react";
import type { Environment, KeyValue } from "@/types";
import { EyeOff, Lock, Trash2 } from "lucide-react";
import { VariableField } from "@/components/VariableField";
import { TooltipIconButton } from "@/components/TooltipIconButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { createKeyValue, ensureTrailingBlankKeyValue, isKeyValueBlank } from "@/lib/helpers";
import { cn } from "@/lib/utils";

type KeyValueEditorProps = {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  environment?: Environment | null;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  autoBlank?: boolean;
  allowAdd?: boolean;
  keyReadOnly?: boolean;
  showSecretToggle?: boolean;
  showInitial?: boolean;
  valueLabel?: string;
};

export function KeyValueEditor({
  rows,
  onChange,
  environment = null,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  autoBlank = true,
  allowAdd = true,
  keyReadOnly = false,
  showSecretToggle = false,
  showInitial = false,
  valueLabel = "Value",
}: KeyValueEditorProps) {
  const extraBlankRef = useRef<KeyValue | null>(null);
  const last = rows[rows.length - 1];
  const needsExtra = autoBlank && (!last || !isKeyValueBlank(last));
  if (needsExtra) {
    extraBlankRef.current ??= createKeyValue();
  } else {
    extraBlankRef.current = null;
  }
  const displayRows =
    needsExtra && extraBlankRef.current ? [...rows, extraBlankRef.current] : rows;

  const commit = (next: KeyValue[]) => {
    onChange(autoBlank ? ensureTrailingBlankKeyValue(next) : next);
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

  const gridClass = showInitial
    ? "grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px_32px]"
    : showSecretToggle
      ? "grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_32px_32px]"
      : "grid-cols-[32px_1fr_1fr_32px]";

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "grid gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground",
          gridClass,
        )}
      >
        <span />
        <span>Key</span>
        {showInitial && <span>Initial</span>}
        <span>{valueLabel}</span>
        {showSecretToggle && <span />}
        <span />
      </div>
      {displayRows.map((row, index) => {
        const trailingBlank = autoBlank && index === displayRows.length - 1 && isKeyValueBlank(row);
        return (
          <div
            key={row.id}
            className={cn(
              "grid items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50",
              gridClass,
              !row.enabled && "opacity-50",
            )}
          >
            <Checkbox
              checked={row.enabled}
              onCheckedChange={(checked) => updateRow(row.id, { enabled: checked === true })}
              aria-label="Enable row"
            />
            {keyReadOnly ? (
              <Input
                value={row.key}
                readOnly
                className="h-8 font-mono text-[13px] text-muted-foreground"
              />
            ) : (
              <VariableField
                embedded
                environment={environment}
                value={row.key}
                placeholder={keyPlaceholder}
                onChange={(key) => updateRow(row.id, { key })}
              />
            )}
            {showInitial && (
              <VariableField
                embedded
                environment={environment}
                value={row.initialValue ?? ""}
                placeholder="Initial"
                onChange={(initialValue) => updateRow(row.id, { initialValue })}
              />
            )}
            <VariableField
              embedded
              environment={environment}
              type={row.secret ? "password" : undefined}
              value={row.value}
              placeholder={valuePlaceholder}
              onChange={(value) => updateRow(row.id, { value })}
            />
            {showSecretToggle && (
              <TooltipIconButton
                variant="ghost"
                size="icon"
                className="size-8"
                label={row.secret ? "Show value" : "Mark as secret"}
                onClick={() => updateRow(row.id, { secret: !row.secret })}
              >
                {row.secret ? <EyeOff className="size-3.5" /> : <Lock className="size-3.5" />}
              </TooltipIconButton>
            )}
            <TooltipIconButton
              variant="ghost"
              size="icon"
              className={cn(
                "size-8",
                (trailingBlank || keyReadOnly) &&
                  displayRows.length > 0 &&
                  "pointer-events-none opacity-0",
              )}
              label="Remove row"
              disabled={trailingBlank || keyReadOnly}
              onClick={() => removeRow(row.id)}
            >
              <Trash2 className="size-4" />
            </TooltipIconButton>
          </div>
        );
      })}
      {allowAdd && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="link" className="h-auto px-1" onClick={addRow}>
            + Add row
          </Button>
          {showInitial && (
            <Button
              type="button"
              variant="link"
              className="h-auto px-1 text-muted-foreground"
              onClick={() =>
                commit(
                  displayRows.map((row) => ({
                    ...row,
                    value: row.initialValue ?? row.value,
                  })),
                )
              }
            >
              Reset current from initial
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
