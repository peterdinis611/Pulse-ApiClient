import type { HttpMethod } from "@/types";

export function methodShortLabel(method: HttpMethod | string): string {
  if (method === "DELETE") return "DEL";
  if (method === "OPTIONS") return "OPT";
  return method;
}

export function methodTextClass(method: HttpMethod | string): string {
  switch (method) {
    case "GET":
      return "text-method-get";
    case "POST":
      return "text-method-post";
    case "PUT":
      return "text-method-put";
    case "PATCH":
      return "text-method-patch";
    case "DELETE":
      return "text-method-delete";
    default:
      return "text-muted-foreground";
  }
}

export function methodBadgeClass(method: HttpMethod | string): string {
  switch (method) {
    case "GET":
      return "method-badge-get";
    case "POST":
      return "method-badge-post";
    case "PUT":
      return "method-badge-put";
    case "PATCH":
      return "method-badge-patch";
    case "DELETE":
      return "method-badge-delete";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function statusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) return "status-badge-success";
  if (status >= 400) return "status-badge-error";
  return "status-badge-info";
}
