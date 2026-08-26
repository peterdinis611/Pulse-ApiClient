import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { Environment } from "@/types";
import {
  containsVariables,
  getActiveVariableQuery,
  getEnabledVariables,
  insertVariableAtCursor,
  substituteVariables,
  variableTemplate,
} from "@/lib/env";
import { VariablePicker } from "@/components/VariablePicker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type VariableFieldBaseProps = {
  environment: Environment | null;
  value: string;
  onChange: (value: string) => void;
  showPreview?: boolean;
  embedded?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: ComponentPropsWithoutRef<"input">["type"];
  focusTarget?: "url";
};

type VariableFieldProps = VariableFieldBaseProps & {
  multiline?: boolean;
};

export function VariableField({
  environment,
  value,
  onChange,
  showPreview = false,
  multiline = false,
  embedded = false,
  className,
  inputClassName,
  id,
  placeholder,
  disabled,
  type,
  focusTarget,
}: VariableFieldProps) {
  const listId = useId();
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(value.length);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const activeQuery = getActiveVariableQuery(value, cursor);
  const variables = getEnabledVariables(environment);
  const suggestions = useMemo(() => {
    if (activeQuery == null) return [];
    const query = activeQuery.toLowerCase();
    return variables.filter((variable) =>
      variable.key.toLowerCase().includes(query),
    );
  }, [activeQuery, variables]);

  const autocompleteOpen = activeQuery != null && suggestions.length > 0;

  useEffect(() => {
    setHighlightIndex(0);
  }, [activeQuery, suggestions.length]);

  const applyVariable = (key: string) => {
    const field = fieldRef.current;
    const nextCursor = field?.selectionStart ?? cursor;
    const next = insertVariableAtCursor(value, nextCursor, key);
    onChange(next.value);
    setCursor(next.cursor);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const resolvedPreview = useMemo(
    () => substituteVariables(value, environment),
    [environment, value],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (autocompleteOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightIndex((current) => (current + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const selected = suggestions[highlightIndex];
        if (selected) applyVariable(selected.key);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCursor((event.target as HTMLInputElement).selectionStart ?? value.length);
      }
    }
  };

  const sharedProps = {
    id,
    placeholder,
    disabled,
    value,
    spellCheck: false as const,
    className: cn("pr-9 font-mono text-sm", inputClassName),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(event.target.value);
      setCursor(event.target.selectionStart ?? event.target.value.length);
    },
    onClick: (event: MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setCursor((event.target as HTMLInputElement).selectionStart ?? value.length);
    },
    onKeyUp: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setCursor((event.target as HTMLInputElement).selectionStart ?? value.length);
    },
    onKeyDown: handleKeyDown,
  };

  return (
    <div className={cn(!embedded && "space-y-1", className)}>
      <div className="relative min-w-0">
        {multiline ? (
          <Textarea
            ref={fieldRef as never}
            data-pulse-focus={focusTarget}
            {...sharedProps}
          />
        ) : (
          <Input
            ref={fieldRef as never}
            type={type}
            data-pulse-focus={focusTarget}
            {...sharedProps}
          />
        )}
        <div
          className={cn(
            "absolute right-1",
            multiline ? "top-1" : "top-1/2 -translate-y-1/2",
          )}
        >
          <VariablePicker environment={environment} onSelect={applyVariable} />
        </div>

        {autocompleteOpen && (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-8 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md"
          >
            {suggestions.map((variable, index) => (
              <button
                key={variable.id}
                type="button"
                role="option"
                aria-selected={index === highlightIndex}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs hover:bg-accent",
                  index === highlightIndex && "bg-accent",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  applyVariable(variable.key);
                }}
              >
                <span className="text-primary">{variableTemplate(variable.key)}</span>
                <span className="truncate text-muted-foreground">{variable.value}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showPreview && containsVariables(value) && (
        <p className="truncate font-mono text-xs text-muted-foreground" title={resolvedPreview}>
          <span className="text-foreground/70">Resolved: </span>
          {resolvedPreview}
        </p>
      )}
    </div>
  );
}
