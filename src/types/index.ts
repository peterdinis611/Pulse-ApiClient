export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type BodyKind = "none" | "json" | "raw" | "form" | "multipart" | "graphql";
export type AuthType = "none" | "bearer" | "basic" | "apiKey" | "oauth2";
export type OAuth2GrantType = "client_credentials" | "authorization_code";
export type ApiKeyLocation = "header" | "query";
export type MultipartFieldType = "text" | "file";
export type SidebarTab = "collections" | "history" | "environments";
export type MainView = "overview" | "request" | "environments" | "settings" | "docs";

export type RequestProtocol = "http" | "websocket";

export type WebSocketStatus = "idle" | "connecting" | "open" | "closing" | "closed" | "error";

export type WebSocketMessage = {
  id: string;
  direction: "incoming" | "outgoing";
  data: string;
  binary: boolean;
  timestamp: number;
};

export type WebSocketSession = {
  connectionId: string | null;
  status: WebSocketStatus;
  messages: WebSocketMessage[];
  handshakeStatus?: number;
  handshakeHeaders?: Array<{ key: string; value: string }>;
  closeCode?: number;
  closeReason?: string;
  error?: string | null;
};

export type RequestTabState = {
  id: string;
  request: ApiRequest;
  /** When set, this tab uses the environment instead of the workspace default. */
  environmentId?: string | null;
  response: HttpResponse | null;
  error: string | null;
  loading: boolean;
  inFlightRequestId: string | null;
  testResults: TestRunResult | null;
  ws: WebSocketSession;
};

export type KeyValue = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

export type MultipartField = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  fieldType: MultipartFieldType;
  fileName?: string;
  mimeType?: string;
};

export type AuthConfig = {
  authType: AuthType;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
  apiKeyKey: string;
  apiKeyValue: string;
  apiKeyIn: ApiKeyLocation;
  oauthGrantType: OAuth2GrantType;
  oauthTokenUrl: string;
  oauthAuthorizeUrl: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthScope: string;
  oauthRedirectUri: string;
  oauthRefreshToken: string;
  oauthCodeVerifier: string;
  oauthAuthCode: string;
};

export type ApiRequest = {
  id: string;
  name: string;
  protocol: RequestProtocol;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  query: KeyValue[];
  bodyKind: BodyKind;
  body: string;
  graphqlQuery: string;
  graphqlVariables: string;
  graphqlOperationName: string;
  form: KeyValue[];
  multipart: MultipartField[];
  auth: AuthConfig;
  tests: string;
  preRequestScript: string;
};

export type HttpResponse = {
  status: number;
  statusText: string;
  headers: Array<{ key: string; value: string }>;
  body: string;
  /** `"utf8"` (default) or `"base64"` for binary/media bodies. */
  bodyEncoding?: "utf8" | "base64" | string | null;
  elapsedMs: number;
  sizeBytes: number;
  contentType?: string | null;
  fromCache?: boolean;
  cacheAgeMs?: number | null;
  requestId?: string | null;
};

export type HttpEngineStats = {
  activeRequests: number;
  maxConcurrent: number;
  cacheEntries: number;
  cacheMemoryEntries: number;
  cacheDiskEntries: number;
  cacheHits: number;
  totalCompleted: number;
  totalFailed: number;
  defaultTimeoutMs: number;
};

export type HttpSettings = {
  httpMaxConcurrent: number;
  httpTimeoutMs: number;
  httpCacheEnabled: boolean;
  httpCacheTtlSec: number;
  httpCacheDiskEnabled: boolean;
};

export type AppSettings = HttpSettings & {
  theme: string;
  customThemeCssPath?: string | null;
};

export type CollectionGroup = {
  id: string;
  name: string;
  source: "pulse" | "postman" | "bruno" | "insomnia";
  folders: string[];
};

export type SavedRequest = {
  id: string;
  name: string;
  collectionId: string;
  folder?: string;
  request: ApiRequest;
};

export type Environment = {
  id: string;
  name: string;
  variables: KeyValue[];
};

export type HistoryEntry = {
  id: string;
  sentAt: string;
  request: ApiRequest;
  response?: Pick<HttpResponse, "status" | "elapsedMs" | "sizeBytes">;
};

export type RequestTab = "params" | "headers" | "body" | "auth" | "pre-request" | "tests";

export type TestCaseResult = {
  name: string;
  passed: boolean;
  message?: string | null;
};

export type TestRunResult = {
  passed: number;
  failed: number;
  total: number;
  results: TestCaseResult[];
};

export const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export const BODY_KINDS: { id: BodyKind; label: string }[] = [
  { id: "none", label: "None" },
  { id: "json", label: "JSON" },
  { id: "graphql", label: "GraphQL" },
  { id: "raw", label: "Raw" },
  { id: "form", label: "Form URL Encoded" },
  { id: "multipart", label: "Form Data" },
];
