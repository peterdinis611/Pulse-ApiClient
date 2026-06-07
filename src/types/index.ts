export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type BodyKind = "none" | "json" | "raw" | "form" | "multipart" | "graphql";
export type AuthType = "none" | "bearer" | "basic" | "apiKey";
export type ApiKeyLocation = "header" | "query";
export type MultipartFieldType = "text" | "file";
export type SidebarTab = "collections" | "history" | "environments";
export type MainView = "overview" | "request" | "environments" | "settings";

export type RequestTabState = {
  id: string;
  request: ApiRequest;
  response: HttpResponse | null;
  error: string | null;
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
};

export type ApiRequest = {
  id: string;
  name: string;
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
};

export type HttpResponse = {
  status: number;
  statusText: string;
  headers: Array<{ key: string; value: string }>;
  body: string;
  elapsedMs: number;
  sizeBytes: number;
  contentType?: string | null;
  fromCache?: boolean;
  cacheAgeMs?: number | null;
};

export type CollectionGroup = {
  id: string;
  name: string;
  source: "pulse" | "postman";
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

export type RequestTab = "params" | "headers" | "body" | "auth";

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
