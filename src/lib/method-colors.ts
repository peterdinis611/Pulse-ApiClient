import type { HttpMethod } from "@/types";

export function methodShortLabel(method: HttpMethod | string): string {
  if (method === "DELETE") return "DEL";
  if (method === "OPTIONS") return "OPT";
  return method;
}

export function methodTextClass(method: HttpMethod | string): string {
  switch (method) {
    case "GET":
      return "text-emerald-600 dark:text-emerald-400";
    case "POST":
      return "text-amber-600 dark:text-amber-400";
    case "PUT":
      return "text-sky-600 dark:text-sky-400";
    case "PATCH":
      return "text-cyan-600 dark:text-cyan-400";
    case "DELETE":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-muted-foreground";
  }
}

export function methodBadgeClass(method: HttpMethod | string): string {
  switch (method) {
    case "GET":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "POST":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "PUT":
      return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400";
    case "PATCH":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400";
    case "DELETE":
      return "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function statusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status >= 400) {
    return "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400";
  }
  return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400";
}
