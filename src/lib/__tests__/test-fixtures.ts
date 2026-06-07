import type { FilterableItem } from "../filters";
import type { SearchDocument } from "../fuzzy-search";

export function makeFilterableItem(
  partial: Partial<FilterableItem> & Pick<FilterableItem, "id">,
): FilterableItem {
  return {
    title: "Untitled",
    subtitle: "https://example.com",
    method: "GET",
    meta: "meta",
    source: "history",
    onOpen: () => {},
    ...partial,
  };
}

export const overviewDocuments: SearchDocument[] = [
  {
    id: "1",
    title: "Get users",
    subtitle: "https://api.example.com/users",
    method: "GET",
    meta: "Auth",
  },
  {
    id: "2",
    title: "Create order",
    subtitle: "https://api.example.com/orders",
    method: "POST",
    meta: "Checkout",
  },
  {
    id: "3",
    title: "Health check",
    subtitle: "https://api.example.com/health",
    method: "GET",
    meta: "Monitoring",
    keywords: "200",
  },
];
