import { useMemo, useState } from "react";
import { BookOpen, LoaderCircle } from "lucide-react";
import { useApp } from "@/machines";
import {
  buildGraphqlFieldStub,
  formatGraphqlTypeRef,
  GRAPHQL_INTROSPECTION_QUERY,
  graphqlOperationKindForType,
  parseGraphqlSchema,
  visibleGraphqlTypes,
  type GraphqlSchema,
  type GraphqlType,
} from "@/lib/graphql";
import { sendRequest } from "@/lib/http-client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GraphqlExplorer() {
  const { request, variableEnvironment, updateRequest } = useApp();
  const [schema, setSchema] = useState<GraphqlSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeName, setActiveName] = useState<string | null>(null);

  const types = useMemo(() => (schema ? visibleGraphqlTypes(schema) : []), [schema]);
  const active: GraphqlType | undefined = types.find((type) => type.name === activeName) ?? types[0];

  const introspect = async () => {
    if (!request.url.trim()) {
      toast.error("Enter a GraphQL URL first");
      return;
    }
    setLoading(true);
    try {
      // Introspection always uses HTTP — even when the tab is on WebSocket for subscriptions.
      const httpUrl = request.url.replace(/^ws(s?):\/\//i, "http$1://");
      const response = await sendRequest(
        {
          ...request,
          url: httpUrl,
          method: "POST",
          protocol: "http",
          bodyKind: "graphql",
          graphqlQuery: GRAPHQL_INTROSPECTION_QUERY,
          graphqlVariables: "{}",
          graphqlOperationName: "PulseIntrospection",
        },
        variableEnvironment,
      );
      const parsed = parseGraphqlSchema(response.body);
      if (!parsed) {
        toast.error("Introspection failed", "Response is not a GraphQL schema");
        return;
      }
      setSchema(parsed);
      setActiveName(parsed.queryType?.name ?? parsed.types[0]?.name ?? null);
      toast.success("Schema loaded", `${visibleGraphqlTypes(parsed).length} types`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Introspection failed");
    } finally {
      setLoading(false);
    }
  };

  const insertField = (typeName: string, fieldName: string) => {
    if (!schema) return;
    const operation = graphqlOperationKindForType(schema, typeName);
    const stub = buildGraphqlFieldStub(operation, typeName, fieldName);
    if (operation === "subscription") {
      const wsUrl = request.url.replace(/^http(s?):\/\//i, "ws$1://");
      updateRequest({
        graphqlQuery: stub,
        graphqlOperationName: typeName,
        protocol: "websocket",
        bodyKind: "graphql",
        url: wsUrl.startsWith("ws") ? wsUrl : request.url,
      });
      toast.info("Subscription stub", "Switched to WebSocket — Connect, then Subscribe");
    } else {
      updateRequest({
        graphqlQuery: stub,
        graphqlOperationName: typeName,
        protocol: "http",
        bodyKind: "graphql",
      });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Schema explorer</p>
          <p className="text-xs text-muted-foreground">
            Introspect over HTTP (auth and headers apply). Subscription fields open a WebSocket stub.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void introspect()}>
          {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
          {loading ? "Introspecting…" : "Introspect"}
        </Button>
      </div>
      {schema && (
        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
          <div className="max-h-56 space-y-0.5 overflow-auto">
            {types.map((type) => {
              const kind = graphqlOperationKindForType(schema, type.name);
              return (
              <button
                key={type.name ?? ""}
                type="button"
                className={cn(
                  "w-full truncate rounded-md px-2 py-1 text-left font-mono text-[11px]",
                  (active?.name ?? "") === type.name
                    ? "bg-primary/12 text-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
                onClick={() => setActiveName(type.name ?? null)}
              >
                {type.name}
                {(kind === "subscription" || kind === "mutation") && (
                  <span className="ml-1 text-[10px] opacity-60">{kind.slice(0, 3)}</span>
                )}
              </button>
              );
            })}
          </div>
          <div className="max-h-56 space-y-2 overflow-auto">
            {active?.description && (
              <p className="text-[12px] text-muted-foreground">{active.description}</p>
            )}
            {(active?.fields ?? []).map((field) => (
              <button
                key={field.name}
                type="button"
                className="block w-full rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-left hover:border-primary/40"
                onClick={() => insertField(active?.name ?? "Query", field.name)}
              >
                <span className="font-mono text-[12px] text-foreground">{field.name}</span>
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {formatGraphqlTypeRef(field.type)}
                </span>
                {field.description && (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{field.description}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
