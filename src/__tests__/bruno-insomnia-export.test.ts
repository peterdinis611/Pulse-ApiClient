import { describe, expect, it } from "vitest";
import { createCollectionGroup } from "@/lib/collections";
import { createKeyValue, createRequest, createSavedRequest, defaultAuth } from "@/lib/helpers";
import { exportBrunoCollection } from "@/lib/bruno-export";
import { exportInsomniaCollection } from "@/lib/insomnia-export";
import { importBrunoCollection, isBrunoCollection } from "@/lib/bruno-import";
import { importInsomniaCollection, isInsomniaExport } from "@/lib/insomnia-import";
import { exportHistoryAsHar } from "@/lib/har-export";
import { createHistoryEntry } from "@/lib/helpers";
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

describe("exportBrunoCollection", () => {
  it("round-trips nested folders through Bruno import", () => {
    const { group, requests } = sampleCollection();
    const raw = exportBrunoCollection(group, requests);
    expect(isBrunoCollection(raw)).toBe(true);

    const imported = importBrunoCollection(raw);
    expect(imported.collection.name).toBe("Payments API");
    expect(imported.requests).toHaveLength(2);
    expect(imported.requests.find((item) => item.name === "Login")?.folder).toBe("Auth/Login");
    expect(imported.requests.find((item) => item.name === "Login")?.request.auth.authType).toBe(
      "bearer",
    );
  });
});

describe("exportInsomniaCollection", () => {
  it("round-trips nested folders through Insomnia import", () => {
    const { group, requests } = sampleCollection();
    const raw = exportInsomniaCollection(group, requests);
    expect(isInsomniaExport(raw)).toBe(true);

    const imported = importInsomniaCollection(raw);
    expect(imported.collection.name).toBe("Payments API");
    expect(imported.requests).toHaveLength(2);
    expect(imported.requests.find((item) => item.name === "Login")?.folder).toBe("Auth/Login");
    expect(imported.requests.find((item) => item.name === "Health")?.request.method).toBe("GET");
  });
});

describe("exportHistoryAsHar", () => {
  it("writes HAR 1.2 entries from history", () => {
    const entry = createHistoryEntry(
      createRequest({
        method: "GET",
        url: "https://api.example.com/health",
        query: [createKeyValue({ key: "verbose", value: "1" })],
      }),
      { status: 200, elapsedMs: 42, sizeBytes: 12 },
    );
    const har = JSON.parse(exportHistoryAsHar([entry])) as {
      log: { version: string; entries: Array<{ request: { method: string }; response: { status: number } }> };
    };
    expect(har.log.version).toBe("1.2");
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0]?.request.method).toBe("GET");
    expect(har.log.entries[0]?.response.status).toBe(200);
  });
});
