import { useApp } from "@/machines";
import { KeyValueEditor } from "@/components/KeyValueEditor";
import { TestsTabPanel } from "@/components/TestsTabPanel";
import { BODY_KINDS } from "@/types";
import type { BodyKind, MultipartField } from "@/types";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollAreaWithTop } from "@/components/ui/scroll-area-with-top";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function applyBodyKind(bodyKind: BodyKind) {
  if (bodyKind === "graphql") {
    return {
      bodyKind,
      method: "POST" as const,
    };
  }
  return { bodyKind };
}

export function RequestTabs() {
  const { request, requestTab, setRequestTab, updateRequest } = useApp();

  const paramCount = request.query.filter((q) => q.enabled && q.key.trim()).length;
  const headerCount = request.headers.filter((h) => h.enabled && h.key.trim()).length;

  const updateMultipart = (rows: MultipartField[]) => {
    updateRequest({ multipart: rows });
  };

  const addMultipartRow = () => {
    updateRequest({
      multipart: [
        ...request.multipart,
        {
          id: crypto.randomUUID(),
          key: "",
          value: "",
          enabled: true,
          fieldType: "text",
        },
      ],
    });
  };

  const pickFile = async (rowId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result ?? "").split(",")[1] ?? "";
        updateRequest({
          multipart: request.multipart.map((row) =>
            row.id === rowId
              ? {
                  ...row,
                  fieldType: "file",
                  value: base64,
                  fileName: file.name,
                  mimeType: file.type || "application/octet-stream",
                }
              : row,
          ),
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Request
        </span>
        <Tabs
          value={requestTab}
          onValueChange={(value) => setRequestTab(value as typeof requestTab)}
          className="min-w-0 flex-1"
        >
          <TabsList className="h-8 bg-muted">
            <TabsTrigger value="params" className="text-xs">
              Params
              {paramCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {paramCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="headers" className="text-xs">
              Headers
              {headerCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {headerCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="body" className="text-xs">
              Body
            </TabsTrigger>
            <TabsTrigger value="auth" className="text-xs">
              Auth
            </TabsTrigger>
            <TabsTrigger value="tests" className="text-xs">
              Tests
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={requestTab}>
        <div className="p-4">
          {requestTab === "params" && (
            <KeyValueEditor
              rows={request.query}
              onChange={(query) => updateRequest({ query })}
              keyPlaceholder="Query param"
            />
          )}

          {requestTab === "headers" && (
            <KeyValueEditor
              rows={request.headers}
              onChange={(headers) => updateRequest({ headers })}
              keyPlaceholder="Header"
            />
          )}

          {requestTab === "body" && (
            <div className="space-y-4">
              <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                {BODY_KINDS.map((kind) => (
                  <button
                    key={kind.id}
                    type="button"
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      request.bodyKind === kind.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => updateRequest(applyBodyKind(kind.id))}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>

              {request.bodyKind === "graphql" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="graphql-operation">Operation name</Label>
                    <Input
                      id="graphql-operation"
                      value={request.graphqlOperationName}
                      onChange={(event) =>
                        updateRequest({ graphqlOperationName: event.target.value })
                      }
                      placeholder="Optional operation name"
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="graphql-query">Query</Label>
                    <Textarea
                      id="graphql-query"
                      value={request.graphqlQuery}
                      onChange={(event) => updateRequest({ graphqlQuery: event.target.value })}
                      spellCheck={false}
                      className="min-h-[220px] font-mono text-sm"
                      placeholder={`query Example {\n  __typename\n}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="graphql-variables">Variables (JSON)</Label>
                    <Textarea
                      id="graphql-variables"
                      value={request.graphqlVariables}
                      onChange={(event) => updateRequest({ graphqlVariables: event.target.value })}
                      spellCheck={false}
                      className="min-h-[120px] font-mono text-sm"
                      placeholder='{\n  "id": "1"\n}'
                    />
                  </div>
                </div>
              )}

              {(request.bodyKind === "json" || request.bodyKind === "raw") && (
                <Textarea
                  value={request.body}
                  onChange={(event) => updateRequest({ body: event.target.value })}
                  spellCheck={false}
                  placeholder={
                    request.bodyKind === "json" ? '{\n  "key": "value"\n}' : "Raw body content"
                  }
                />
              )}

              {request.bodyKind === "form" && (
                <KeyValueEditor rows={request.form} onChange={(form) => updateRequest({ form })} />
              )}

              {request.bodyKind === "multipart" && (
                <div className="space-y-2">
                  {request.multipart.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[32px_1fr_110px_1fr_32px] items-center gap-2 rounded-md p-1 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={row.enabled}
                        onCheckedChange={(checked) =>
                          updateMultipart(
                            request.multipart.map((item) =>
                              item.id === row.id
                                ? { ...item, enabled: checked === true }
                                : item,
                            ),
                          )
                        }
                      />
                      <Input
                        value={row.key}
                        placeholder="Field name"
                        onChange={(event) =>
                          updateMultipart(
                            request.multipart.map((item) =>
                              item.id === row.id ? { ...item, key: event.target.value } : item,
                            ),
                          )
                        }
                      />
                      <Select
                        value={row.fieldType}
                        onValueChange={(value) =>
                          updateMultipart(
                            request.multipart.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    fieldType: value as MultipartField["fieldType"],
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="file">File</SelectItem>
                        </SelectContent>
                      </Select>
                      {row.fieldType === "text" ? (
                        <Input
                          value={row.value}
                          placeholder="Value"
                          onChange={(event) =>
                            updateMultipart(
                              request.multipart.map((item) =>
                                item.id === row.id
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      ) : (
                        <div className="flex min-w-0 items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void pickFile(row.id)}
                          >
                            Choose file
                          </Button>
                          <span className="truncate text-xs text-muted-foreground">
                            {row.fileName ?? "No file"}
                          </span>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() =>
                          updateMultipart(request.multipart.filter((item) => item.id !== row.id))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="link" className="h-auto px-1" onClick={addMultipartRow}>
                    + Add field
                  </Button>
                </div>
              )}

              {request.bodyKind === "none" && (
                <p className="text-sm text-muted-foreground">This request does not have a body.</p>
              )}
            </div>
          )}

          {requestTab === "auth" && (
            <div className="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="auth-type">Auth type</Label>
                <Select
                  value={request.auth.authType}
                  onValueChange={(value) =>
                    updateRequest({
                      auth: {
                        ...request.auth,
                        authType: value as typeof request.auth.authType,
                      },
                    })
                  }
                >
                  <SelectTrigger id="auth-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Auth</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                    <SelectItem value="apiKey">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {request.auth.authType === "bearer" && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bearer-token">Token</Label>
                  <Input
                    id="bearer-token"
                    value={request.auth.bearerToken}
                    onChange={(event) =>
                      updateRequest({
                        auth: { ...request.auth, bearerToken: event.target.value },
                      })
                    }
                    placeholder="{{token}}"
                  />
                </div>
              )}

              {request.auth.authType === "basic" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="basic-user">Username</Label>
                    <Input
                      id="basic-user"
                      value={request.auth.basicUsername}
                      onChange={(event) =>
                        updateRequest({
                          auth: { ...request.auth, basicUsername: event.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="basic-pass">Password</Label>
                    <Input
                      id="basic-pass"
                      type="password"
                      value={request.auth.basicPassword}
                      onChange={(event) =>
                        updateRequest({
                          auth: { ...request.auth, basicPassword: event.target.value },
                        })
                      }
                    />
                  </div>
                </>
              )}

              {request.auth.authType === "apiKey" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="api-key-name">Key name</Label>
                    <Input
                      id="api-key-name"
                      value={request.auth.apiKeyKey}
                      onChange={(event) =>
                        updateRequest({
                          auth: { ...request.auth, apiKeyKey: event.target.value },
                        })
                      }
                      placeholder="X-API-Key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-key-value">Value</Label>
                    <Input
                      id="api-key-value"
                      value={request.auth.apiKeyValue}
                      onChange={(event) =>
                        updateRequest({
                          auth: { ...request.auth, apiKeyValue: event.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-key-in">Add to</Label>
                    <Select
                      value={request.auth.apiKeyIn}
                      onValueChange={(value) =>
                        updateRequest({
                          auth: {
                            ...request.auth,
                            apiKeyIn: value as typeof request.auth.apiKeyIn,
                          },
                        })
                      }
                    >
                      <SelectTrigger id="api-key-in">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="header">Header</SelectItem>
                        <SelectItem value="query">Query Params</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          )}

          {requestTab === "tests" && <TestsTabPanel />}
        </div>
      </ScrollAreaWithTop>
    </section>
  );
}
