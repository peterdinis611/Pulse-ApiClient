import { useApp } from "@/machines";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const PRE_REQUEST_TEMPLATE = `// Runs before the request is sent.
// Set environment variables for this (and later) requests:
pulse.environment.set("token", "replace-me");
// Alias:
// pulse.variables.set("page", 1);
`;

const PRE_REQUEST_SNIPPETS = [
  {
    label: "Set string var",
    code: `pulse.environment.set("token", "abc123");`,
  },
  {
    label: "Set number var",
    code: `pulse.variables.set("page", 1);`,
  },
];

export function PreRequestTabPanel() {
  const { request, updateRequest } = useApp();

  const insertSnippet = (code: string) => {
    const next = request.preRequestScript.trim()
      ? `${request.preRequestScript.trim()}\n${code}`
      : code;
    updateRequest({ preRequestScript: next });
  };

  const handleUseTemplate = () => {
    if (
      request.preRequestScript.trim() &&
      !window.confirm("Replace current pre-request script with template?")
    ) {
      return;
    }
    updateRequest({ preRequestScript: PRE_REQUEST_TEMPLATE });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Pre-request script</p>
          <p className="text-xs text-muted-foreground">
            Runs before Send. Use{" "}
            <code className="rounded bg-muted px-1">pulse.environment.set</code> to write variables
            that <code className="rounded bg-muted px-1">{"{{var}}"}</code> can read.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleUseTemplate}>
            Template
          </Button>
          {PRE_REQUEST_SNIPPETS.map((snippet) => (
            <Button
              key={snippet.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => insertSnippet(snippet.code)}
            >
              {snippet.label}
            </Button>
          ))}
        </div>
      </div>
      <Textarea
        value={request.preRequestScript}
        onChange={(event) => updateRequest({ preRequestScript: event.target.value })}
        spellCheck={false}
        className="min-h-[280px] font-mono text-xs leading-relaxed"
        placeholder={PRE_REQUEST_TEMPLATE}
      />
    </div>
  );
}
