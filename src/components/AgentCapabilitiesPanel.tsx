import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useT } from "@/hooks/useLocale";
import {
  AGENT_CAPABILITIES,
  type AgentCapability,
  type AgentSettings,
} from "@/lib/agent-settings";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const CAPABILITY_LABEL: Record<AgentCapability, MessageKey> = {
  import_curl: "agent.capability.import_curl",
  explain_response: "agent.capability.explain_response",
  explain_tests: "agent.capability.explain_tests",
  workspace_status: "agent.capability.workspace_status",
  workspace_history: "agent.capability.workspace_history",
  run_collection: "agent.capability.run_collection",
  graphql_summarize: "agent.capability.graphql_summarize",
  sse_parse: "agent.capability.sse_parse",
  memory: "agent.capability.memory",
};

const CAPABILITY_HINT: Record<AgentCapability, MessageKey> = {
  import_curl: "agent.capability.import_curlHint",
  explain_response: "agent.capability.explain_responseHint",
  explain_tests: "agent.capability.explain_testsHint",
  workspace_status: "agent.capability.workspace_statusHint",
  workspace_history: "agent.capability.workspace_historyHint",
  run_collection: "agent.capability.run_collectionHint",
  graphql_summarize: "agent.capability.graphql_summarizeHint",
  sse_parse: "agent.capability.sse_parseHint",
  memory: "agent.capability.memoryHint",
};

type AgentCapabilitiesPanelProps = {
  settings: AgentSettings;
  onChange: (next: AgentSettings) => void;
  className?: string;
  /** Start with the capability list open. */
  defaultOpen?: boolean;
};

export function AgentCapabilitiesPanel({
  settings,
  onChange,
  className,
  defaultOpen = false,
}: AgentCapabilitiesPanelProps) {
  const t = useT();
  const enabledCount = AGENT_CAPABILITIES.filter((id) => settings.capabilities[id]).length;

  return (
    <div className={cn("space-y-3", className)}>
      <label className="flex cursor-pointer items-start gap-3 border border-border px-3 py-2.5 text-sm">
        <Checkbox
          checked={settings.enabled}
          onCheckedChange={(checked) =>
            onChange({ ...settings, enabled: checked === true })
          }
          className="mt-0.5"
        />
        <span>
          <span className="block font-medium">{t("agent.settings.enabled")}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            {t("agent.settings.enabledHint")}
          </span>
        </span>
      </label>

      <Collapsible defaultOpen={defaultOpen} disabled={!settings.enabled}>
        <CollapsibleTrigger
          type="button"
          disabled={!settings.enabled}
          className={cn(
            "group flex w-full items-center justify-between gap-2 border border-border px-3 py-2.5 text-left text-sm transition-colors",
            settings.enabled
              ? "hover:border-primary/40"
              : "cursor-not-allowed opacity-50",
          )}
        >
          <span>
            <span className="block font-medium">{t("agent.settings.capabilities")}</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {t("agent.settings.capabilitiesHint", {
                enabled: enabledCount,
                total: AGENT_CAPABILITIES.length,
              })}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-1.5">
          {AGENT_CAPABILITIES.map((id) => {
            const active = settings.capabilities[id];
            return (
              <label
                key={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 border border-border px-3 py-2.5 text-sm",
                  !settings.enabled && "opacity-50",
                  active && settings.enabled && "border-primary/45 bg-primary/5",
                )}
              >
                <Checkbox
                  checked={active}
                  disabled={!settings.enabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...settings,
                      capabilities: {
                        ...settings.capabilities,
                        [id]: checked === true,
                      },
                    })
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">{t(CAPABILITY_LABEL[id])}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {t(CAPABILITY_HINT[id])}
                  </span>
                </span>
              </label>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
