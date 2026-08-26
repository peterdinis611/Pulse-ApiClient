import { useState } from "react";
import { useApp } from "@/machines";
import { KeyValueEditor } from "@/components/KeyValueEditor";
import { TestsTabPanel } from "@/components/TestsTabPanel";
import { PreRequestTabPanel } from "@/components/PreRequestTabPanel";
import { BODY_KINDS } from "@/types";
import type { BodyKind, KeyValue, MultipartField } from "@/types";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TooltipIconButton } from "@/components/TooltipIconButton";
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
import { VariableField } from "@/components/VariableField";
import { exchangeOAuthToken } from "@/lib/http-client";
import {
  buildOAuthAuthorizeUrl,
  extractAuthCodeFromRedirect,
  generatePkcePair,
} from "@/lib/oauth";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { canUseTauriIpc } from "@/lib/tauri-runtime";

const CORS_HEADER_PRESETS: Array<{ key: string; value: string; label: string }> = [
  { key: "Origin", value: "http://localhost:5173", label: "Origin" },
  { key: "Referer", value: "http://localhost:5173/", label: "Referer" },
  { key: "User-Agent", value: "Mozilla/5.0 (compatible; PulseAPI/1.0)", label: "User-Agent" },
  {
    key: "Access-Control-Request-Method",
    value: "POST",
    label: "AC-Request-Method",
  },
  {
    key: "Access-Control-Request-Headers",
    value: "content-type, authorization",
    label: "AC-Request-Headers",
  },
  { key: "Cookie", value: "session=", label: "Cookie" },
];

function upsertHeader(rows: KeyValue[], key: string, value: string): KeyValue[] {
  const existing = rows.find((row) => row.key.toLowerCase() === key.toLowerCase());
  if (existing) {
    return rows.map((row) =>
      row.id === existing.id ? { ...row, key, value, enabled: true } : row,
    );
  }
  return [...rows, { id: crypto.randomUUID(), key, value, enabled: true }];
}

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
  const { request, requestTab, setRequestTab, updateRequest, activeEnvironment } = useApp();
  const [oauthBusy, setOauthBusy] = useState(false);

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
    <section className="flex h-full min-h-0 flex-col bg-surface-0">
      <div className="border-b border-border/40 bg-surface-1/30 px-3 py-1.5">
        <Tabs
          value={requestTab}
          onValueChange={(value) => setRequestTab(value as typeof requestTab)}
          className="min-w-0"
        >
          <TabsList className="h-9 bg-transparent p-0.5">
            <TabsTrigger value="params">
              Params
              {paramCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {paramCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="headers">
              Headers
              {headerCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {headerCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="auth">Auth</TabsTrigger>
            <TabsTrigger value="pre-request">Pre-request</TabsTrigger>
            <TabsTrigger value="tests">Tests</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollAreaWithTop className="min-h-0 flex-1" resetKey={requestTab}>
        <div className="p-3">
          {requestTab === "params" && (
            <KeyValueEditor
              rows={request.query}
              environment={activeEnvironment}
              onChange={(query) => updateRequest({ query })}
              keyPlaceholder="Query param"
            />
          )}

          {requestTab === "headers" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  CORS / browser presets
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CORS_HEADER_PRESETS.map((preset) => (
                    <Button
                      key={preset.key}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        updateRequest({
                          headers: upsertHeader(request.headers, preset.key, preset.value),
                        })
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Desktop engine is not limited by browser CORS — these headers help reproduce what a
                  browser would send.
                </p>
              </div>
              <KeyValueEditor
                rows={request.headers}
                environment={activeEnvironment}
                onChange={(headers) => updateRequest({ headers })}
                keyPlaceholder="Header"
              />
            </div>
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
                    <VariableField
                      id="graphql-operation"
                      environment={activeEnvironment}
                      value={request.graphqlOperationName}
                      onChange={(graphqlOperationName) =>
                        updateRequest({ graphqlOperationName })
                      }
                      placeholder="Optional operation name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="graphql-query">Query</Label>
                    <VariableField
                      id="graphql-query"
                      multiline
                      environment={activeEnvironment}
                      value={request.graphqlQuery}
                      onChange={(graphqlQuery) => updateRequest({ graphqlQuery })}
                      inputClassName="min-h-[220px]"
                      placeholder={`query Example {\n  __typename\n}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="graphql-variables">Variables (JSON)</Label>
                    <VariableField
                      id="graphql-variables"
                      multiline
                      environment={activeEnvironment}
                      value={request.graphqlVariables}
                      onChange={(graphqlVariables) => updateRequest({ graphqlVariables })}
                      inputClassName="min-h-[120px]"
                      placeholder='{\n  "id": "{{id}}"\n}'
                    />
                  </div>
                </div>
              )}

              {(request.bodyKind === "json" || request.bodyKind === "raw") && (
                <VariableField
                  multiline
                  environment={activeEnvironment}
                  value={request.body}
                  onChange={(body) => updateRequest({ body })}
                  inputClassName="min-h-[180px]"
                  placeholder={
                    request.bodyKind === "json"
                      ? '{\n  "key": "{{value}}"\n}'
                      : "Raw body with {{variables}}"
                  }
                />
              )}

              {request.bodyKind === "form" && (
                <KeyValueEditor
                  rows={request.form}
                  environment={activeEnvironment}
                  onChange={(form) => updateRequest({ form })}
                />
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
                      <TooltipIconButton
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        label="Remove field"
                        onClick={() =>
                          updateMultipart(request.multipart.filter((item) => item.id !== row.id))
                        }
                      >
                        <Trash2 className="size-4" />
                      </TooltipIconButton>
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
                    <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {request.auth.authType === "bearer" && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bearer-token">Token</Label>
                  <VariableField
                    id="bearer-token"
                    environment={activeEnvironment}
                    value={request.auth.bearerToken}
                    onChange={(bearerToken) =>
                      updateRequest({
                        auth: { ...request.auth, bearerToken },
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
                    <VariableField
                      id="basic-user"
                      environment={activeEnvironment}
                      value={request.auth.basicUsername}
                      onChange={(basicUsername) =>
                        updateRequest({
                          auth: { ...request.auth, basicUsername },
                        })
                      }
                      placeholder="{{username}}"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="basic-pass">Password</Label>
                    <VariableField
                      id="basic-pass"
                      type="password"
                      environment={activeEnvironment}
                      value={request.auth.basicPassword}
                      onChange={(basicPassword) =>
                        updateRequest({
                          auth: { ...request.auth, basicPassword },
                        })
                      }
                      placeholder="{{password}}"
                    />
                  </div>
                </>
              )}

              {request.auth.authType === "apiKey" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="api-key-name">Key name</Label>
                    <VariableField
                      id="api-key-name"
                      environment={activeEnvironment}
                      value={request.auth.apiKeyKey}
                      onChange={(apiKeyKey) =>
                        updateRequest({
                          auth: { ...request.auth, apiKeyKey },
                        })
                      }
                      placeholder="X-API-Key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-key-value">Value</Label>
                    <VariableField
                      id="api-key-value"
                      environment={activeEnvironment}
                      value={request.auth.apiKeyValue}
                      onChange={(apiKeyValue) =>
                        updateRequest({
                          auth: { ...request.auth, apiKeyValue },
                        })
                      }
                      placeholder="{{apiKey}}"
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

              {request.auth.authType === "oauth2" && (
                <>
                  <div className="space-y-2">
                    <Label>Grant type</Label>
                    <Select
                      value={request.auth.oauthGrantType}
                      onValueChange={(value) =>
                        updateRequest({
                          auth: {
                            ...request.auth,
                            oauthGrantType: value as typeof request.auth.oauthGrantType,
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client_credentials">Client credentials</SelectItem>
                        <SelectItem value="authorization_code">Authorization code + PKCE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Token URL</Label>
                    <VariableField
                      environment={activeEnvironment}
                      value={request.auth.oauthTokenUrl}
                      onChange={(oauthTokenUrl) =>
                        updateRequest({ auth: { ...request.auth, oauthTokenUrl } })
                      }
                      placeholder="https://auth.example.com/oauth/token"
                    />
                  </div>
                  {request.auth.oauthGrantType === "authorization_code" && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Authorize URL</Label>
                      <VariableField
                        environment={activeEnvironment}
                        value={request.auth.oauthAuthorizeUrl}
                        onChange={(oauthAuthorizeUrl) =>
                          updateRequest({ auth: { ...request.auth, oauthAuthorizeUrl } })
                        }
                        placeholder="https://auth.example.com/oauth/authorize"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <VariableField
                      environment={activeEnvironment}
                      value={request.auth.oauthClientId}
                      onChange={(oauthClientId) =>
                        updateRequest({ auth: { ...request.auth, oauthClientId } })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Client secret</Label>
                    <VariableField
                      type="password"
                      environment={activeEnvironment}
                      value={request.auth.oauthClientSecret}
                      onChange={(oauthClientSecret) =>
                        updateRequest({ auth: { ...request.auth, oauthClientSecret } })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scope</Label>
                    <VariableField
                      environment={activeEnvironment}
                      value={request.auth.oauthScope}
                      onChange={(oauthScope) =>
                        updateRequest({ auth: { ...request.auth, oauthScope } })
                      }
                      placeholder="openid profile"
                    />
                  </div>
                  {request.auth.oauthGrantType === "authorization_code" && (
                    <>
                      <div className="space-y-2">
                        <Label>Redirect URI</Label>
                        <VariableField
                          environment={activeEnvironment}
                          value={request.auth.oauthRedirectUri}
                          onChange={(oauthRedirectUri) =>
                            updateRequest({ auth: { ...request.auth, oauthRedirectUri } })
                          }
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Authorization code / redirect URL</Label>
                        <VariableField
                          environment={activeEnvironment}
                          value={request.auth.oauthAuthCode}
                          onChange={(oauthAuthCode) =>
                            updateRequest({ auth: { ...request.auth, oauthAuthCode } })
                          }
                          placeholder="Paste code or full redirect URL"
                        />
                      </div>
                    </>
                  )}
                  <div className="space-y-2 md:col-span-2">
                    <Label>Access token</Label>
                    <VariableField
                      environment={activeEnvironment}
                      value={request.auth.bearerToken}
                      onChange={(bearerToken) =>
                        updateRequest({ auth: { ...request.auth, bearerToken } })
                      }
                      placeholder="Fetched token appears here"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    {request.auth.oauthGrantType === "authorization_code" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={oauthBusy}
                        onClick={() => {
                          void (async () => {
                            try {
                              const { verifier, challenge } = await generatePkcePair();
                              updateRequest({
                                auth: { ...request.auth, oauthCodeVerifier: verifier },
                              });
                              const url = buildOAuthAuthorizeUrl({
                                authorizeUrl: request.auth.oauthAuthorizeUrl,
                                clientId: request.auth.oauthClientId,
                                redirectUri: request.auth.oauthRedirectUri,
                                scope: request.auth.oauthScope,
                                codeChallenge: challenge,
                              });
                              window.open(url, "_blank", "noopener,noreferrer");
                              toast.success("Opened authorize URL", "Sign in, then paste the redirect URL or code below.");
                            } catch (error) {
                              toast.error(
                                "Could not start PKCE flow",
                                error instanceof Error ? error.message : undefined,
                              );
                            }
                          })();
                        }}
                      >
                        Open authorize URL
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={oauthBusy || !canUseTauriIpc()}
                      onClick={() => {
                        void (async () => {
                          setOauthBusy(true);
                          try {
                            const grant = request.auth.oauthGrantType;
                            const code =
                              grant === "authorization_code"
                                ? extractAuthCodeFromRedirect(request.auth.oauthAuthCode) ??
                                  request.auth.oauthAuthCode.trim()
                                : null;
                            const token = await exchangeOAuthToken({
                              grantType: grant,
                              tokenUrl: request.auth.oauthTokenUrl,
                              clientId: request.auth.oauthClientId,
                              clientSecret: request.auth.oauthClientSecret || null,
                              scope: request.auth.oauthScope || null,
                              code,
                              redirectUri:
                                grant === "authorization_code"
                                  ? request.auth.oauthRedirectUri
                                  : null,
                              codeVerifier:
                                grant === "authorization_code"
                                  ? request.auth.oauthCodeVerifier
                                  : null,
                            });
                            updateRequest({
                              auth: {
                                ...request.auth,
                                bearerToken: token.accessToken,
                                oauthRefreshToken:
                                  token.refreshToken ?? request.auth.oauthRefreshToken,
                              },
                            });
                            toast.success("OAuth token fetched");
                          } catch (error) {
                            toast.error(
                              "Token exchange failed",
                              error instanceof Error ? error.message : undefined,
                            );
                          } finally {
                            setOauthBusy(false);
                          }
                        })();
                      }}
                    >
                      {oauthBusy ? "Fetching…" : "Fetch token"}
                    </Button>
                    {request.auth.oauthRefreshToken.trim() && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={oauthBusy || !canUseTauriIpc()}
                        onClick={() => {
                          void (async () => {
                            setOauthBusy(true);
                            try {
                              const token = await exchangeOAuthToken({
                                grantType: "refresh_token",
                                tokenUrl: request.auth.oauthTokenUrl,
                                clientId: request.auth.oauthClientId,
                                clientSecret: request.auth.oauthClientSecret || null,
                                refreshToken: request.auth.oauthRefreshToken,
                              });
                              updateRequest({
                                auth: {
                                  ...request.auth,
                                  bearerToken: token.accessToken,
                                  oauthRefreshToken:
                                    token.refreshToken ?? request.auth.oauthRefreshToken,
                                },
                              });
                              toast.success("OAuth token refreshed");
                            } catch (error) {
                              toast.error(
                                "Refresh failed",
                                error instanceof Error ? error.message : undefined,
                              );
                            } finally {
                              setOauthBusy(false);
                            }
                          })();
                        }}
                      >
                        Refresh token
                      </Button>
                    )}
                  </div>
                  {!canUseTauriIpc() && (
                    <p className="text-xs text-muted-foreground md:col-span-2">
                      Token exchange requires the desktop app.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {requestTab === "pre-request" && <PreRequestTabPanel />}
          {requestTab === "tests" && <TestsTabPanel />}
        </div>
      </ScrollAreaWithTop>
    </section>
  );
}
