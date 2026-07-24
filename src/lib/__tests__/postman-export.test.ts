import { describe, expect, it } from "vitest";
import { createCollectionGroup } from "@/lib/collections";
import { createKeyValue, createRequest, createSavedRequest, defaultAuth } from "@/lib/helpers";
import { exportPostmanCollection } from "@/lib/postman-export";
import { isPostmanCollection } from "@/lib/postman-import";
import {
  exportPulseCollection,
  importPulseCollection,
  isPulseCollection,
  PULSE_COLLECTION_SCHEMA,
} from "@/lib/pulse-collection";
import type { CollectionGroup, SavedRequest } from "@/types";

function sampleCollection(): { group: CollectionGroup; requests: SavedRequest[] } {
  const group = createCollectionGroup("Payments API");
  group.folders = ["Auth", "Auth/Login"];

  const login = createSavedRequest(
    createRequest({
      name: "Login",
      method: "POST",
      url: "https://api.example.com/auth/login",
      headers: [createKeyValue({ key: "Content-Type", value: "application/json" })],
      bodyKind: "json",
      body: '{"email":"user@example.com"}',
      auth: {
        ...defaultAuth(),
        authType: "bearer",
        bearerToken: "secret",
      },
      tests: "expect(response.status).toBe(200);",
    }),
    { collectionId: group.id, folder: "Auth/Login", name: "Login" },
  );

  const health = createSavedRequest(
    createRequest({
      name: "Health",
      method: "GET",
      url: "https://api.example.com/health",
      query: [createKeyValue({ key: "verbose", value: "1" })],
    }),
    { collectionId: group.id, name: "Health" },
  );

  return { group, requests: [login, health] };
}

describe("exportPulseCollection", () => {
  it("exports a standalone collection document with nested folders", () => {
    const { group, requests } = sampleCollection();
    const raw = exportPulseCollection(group, requests);
    const parsed = JSON.parse(raw) as {
      info: { name: string; schema: string };
      folders: string[];
      item: Array<{ name: string; item?: unknown[]; request?: { method: string } }>;
    };

    expect(isPulseCollection(raw)).toBe(true);
    expect(parsed.info.name).toBe("Payments API");
    expect(parsed.info.schema).toBe(PULSE_COLLECTION_SCHEMA);
    expect(parsed.folders).toEqual(["Auth", "Auth/Login"]);

    const authFolder = parsed.item.find((item) => item.name === "Auth");
    expect(authFolder?.item?.length).toBeGreaterThan(0);

    const health = parsed.item.find((item) => item.name === "Health");
    expect(health?.request?.method).toBe("GET");
  });

  it("round-trips through import as a new collection", () => {
    const { group, requests } = sampleCollection();
    const raw = exportPulseCollection(group, requests);
    const imported = importPulseCollection(raw);

    expect(imported.collection.name).toBe("Payments API");
    expect(imported.collection.source).toBe("pulse");
    expect(imported.collection.id).not.toBe(group.id);
    expect(imported.requests).toHaveLength(2);
    expect(imported.requests.every((item) => item.collectionId === imported.collection.id)).toBe(
      true,
    );
    expect(imported.requests.find((item) => item.name === "Login")?.folder).toBe("Auth/Login");
  });
});

describe("exportPostmanCollection", () => {
  it("exports nested folders and request details", () => {
    const { group, requests } = sampleCollection();
    const raw = exportPostmanCollection(group, requests);
    const parsed = JSON.parse(raw) as {
      info: { name: string; schema: string };
      item: Array<{ name: string; item?: unknown[]; request?: { method: string } }>;
    };

    expect(isPostmanCollection(raw)).toBe(true);
    expect(parsed.info.name).toBe("Payments API");
    expect(parsed.info.schema).toContain("collection/v2.1.0");

    const authFolder = parsed.item.find((item) => item.name === "Auth");
    expect(authFolder?.item?.length).toBeGreaterThan(0);

    const health = parsed.item.find((item) => item.name === "Health");
    expect(health?.request?.method).toBe("GET");
  });
});
