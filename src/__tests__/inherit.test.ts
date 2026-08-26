import { describe, expect, it } from "vitest";
import {
  applyRequestInheritance,
  collectFolderVariables,
  folderPathChain,
  resolveInheritedAuth,
  resolveInheritedPreRequest,
  resolveInheritedTests,
} from "@/lib/inherit";
import { createCollectionGroup } from "@/lib/collections";
import { createKeyValue, createRequest, defaultAuth } from "@/lib/helpers";

describe("inherit", () => {
  it("builds outer-to-inner folder chains", () => {
    expect(folderPathChain("Auth/Login")).toEqual(["Auth", "Auth/Login"]);
  });

  it("resolves folder auth over collection auth", () => {
    const collection = createCollectionGroup("API");
    collection.auth = { ...defaultAuth(), authType: "bearer", bearerToken: "col" };
    collection.folderConfigs = [
      {
        path: "Auth",
        auth: { ...defaultAuth(), authType: "bearer", bearerToken: "folder" },
      },
    ];
    const request = createRequest({ auth: { ...defaultAuth(), authType: "inherit" } });
    const resolved = resolveInheritedAuth(request.auth, collection, "Auth");
    expect(resolved.auth.bearerToken).toBe("folder");
    expect(resolved.label).toContain("Auth");
  });

  it("concatenates pre-request outer-to-inner then request", () => {
    const collection = createCollectionGroup("API");
    collection.preRequestScript = "collection();";
    collection.folderConfigs = [{ path: "Auth", preRequestScript: "folder();" }];
    const script = resolveInheritedPreRequest("request();", collection, "Auth");
    expect(script).toBe("collection();\n\nfolder();\n\nrequest();");
  });

  it("concatenates tests request then inner folder then collection", () => {
    const collection = createCollectionGroup("API");
    collection.tests = "collection();";
    collection.folderConfigs = [{ path: "Auth", tests: "folder();" }];
    expect(resolveInheritedTests("request();", collection, "Auth")).toBe(
      "request();\n\nfolder();\n\ncollection();",
    );
  });

  it("applies inherited auth onto the request used for send", () => {
    const collection = createCollectionGroup("API");
    collection.auth = { ...defaultAuth(), authType: "bearer", bearerToken: "{{token}}" };
    const request = applyRequestInheritance(
      createRequest({ auth: { ...defaultAuth(), authType: "inherit" } }),
      collection,
    );
    expect(request.auth.authType).toBe("bearer");
    expect(request.auth.bearerToken).toBe("{{token}}");
  });

  it("collects folder variables outer to inner", () => {
    const collection = createCollectionGroup("API");
    collection.folderConfigs = [
      { path: "Auth", variables: [createKeyValue({ key: "a", value: "1" })] },
      { path: "Auth/Login", variables: [createKeyValue({ key: "b", value: "2" })] },
    ];
    const vars = collectFolderVariables(collection, "Auth/Login");
    expect(vars.map((item) => item.key)).toEqual(["a", "b"]);
  });
});
