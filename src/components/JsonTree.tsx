import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { JsonTreeNode } from "@/lib/json-path";
import { jsonLeafString, variableNameFromJsonPath } from "@/lib/json-path";
import { variableTemplate } from "@/lib/env";
import { cn } from "@/lib/utils";

type JsonTreeProps = {
  node: JsonTreeNode;
  onSetVariable: (name: string, value: string) => void;
};

export function JsonTree({ node, onSetVariable }: JsonTreeProps) {
  return (
    <div className="json-tree">
      {node.type === "object" || node.type === "array" ? (
        <div className="space-y-0.5">
          {node.children.length === 0 ? (
            <p className="px-1 font-mono text-[13px] text-muted-foreground">
              {node.type === "array" ? "[]" : "{}"}
            </p>
          ) : (
            node.children.map((child) => (
              <JsonTreeRow key={child.id} node={child} onSetVariable={onSetVariable} depth={0} />
            ))
          )}
        </div>
      ) : (
        <JsonTreeRow node={node} onSetVariable={onSetVariable} depth={0} />
      )}
    </div>
  );
}

function JsonTreeRow({
  node,
  onSetVariable,
  depth,
}: {
  node: JsonTreeNode;
  onSetVariable: (name: string, value: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const nestable = node.type === "object" || node.type === "array";
  const name = variableNameFromJsonPath(node.path);
  const template = variableTemplate(name);

  const setVariable = () => {
    onSetVariable(name, jsonLeafString(node.value));
  };

  return (
    <div>
      <div
        className="group flex items-start gap-1 rounded-md py-0.5 pr-1 hover:bg-primary/10"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {nestable ? (
          <button
            type="button"
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          </button>
        ) : (
          <span className="mt-0.5 size-4 shrink-0" />
        )}
        <button
          type="button"
          className="json-tree-key min-w-0 text-left font-mono text-[13px]"
          title={`Set ${template} from this value`}
          onClick={setVariable}
        >
          {node.key}
        </button>
        <span className="shrink-0 font-mono text-[13px] text-muted-foreground/70">:</span>
        <button
          type="button"
          className={cn(
            "min-w-0 flex-1 truncate text-left font-mono text-[13px]",
            node.type === "string" && "text-foreground",
            node.type === "number" && "text-primary",
            node.type === "boolean" && "text-warning",
            node.type === "null" && "text-muted-foreground",
            nestable && "text-muted-foreground",
          )}
          title={`Set ${template} from this value`}
          onClick={setVariable}
        >
          {nestable ? node.preview : formatLeaf(node)}
        </button>
        <span className="mt-0.5 hidden shrink-0 font-mono text-[10px] text-primary/80 group-hover:inline">
          {template}
        </span>
      </div>
      {nestable && open &&
        node.children.map((child) => (
          <JsonTreeRow key={child.id} node={child} onSetVariable={onSetVariable} depth={depth + 1} />
        ))}
    </div>
  );
}

function formatLeaf(node: JsonTreeNode): string {
  if (node.type === "string") return JSON.stringify(node.value);
  return node.preview;
}
