import { createTabState } from "@/machines/appMachine";
import type { HttpResponse, MainView } from "@/types";
import type { UserSession } from "./auth";
import { createCollectionGroup } from "./collections";
import {
  createEnvironment,
  createKeyValue,
  createRequest,
  createSavedRequest,
} from "./helpers";
import { buildWindowSession, defaultPersistedState, type PersistedState } from "./storage";

export function isScreenshotMode(): boolean {
  return import.meta.env.VITE_SCREENSHOT_MODE === "true";
}

export function getScreenshotMainView(): MainView {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get("shot");
  if (
    shot === "overview" ||
    shot === "request" ||
    shot === "settings" ||
    shot === "environments"
  ) {
    return shot;
  }
  return "request";
}

export const SCREENSHOT_DEMO_USER: UserSession = {
  id: "user_screenshot_demo",
  name: "Demo User",
  email: "demo@pulse.local",
  initials: "DU",
  signedInAt: "2026-01-15T09:00:00.000Z",
};

const mockGithubResponse: HttpResponse = {
  status: 200,
  statusText: "OK",
  headers: [
    { key: "content-type", value: "application/json; charset=utf-8" },
    { key: "x-ratelimit-remaining", value: "59" },
  ],
  body: JSON.stringify(
    {
      login: "octocat",
      id: 583231,
      name: "The Octocat",
      company: "@github",
      blog: "https://github.blog",
      location: "San Francisco",
      public_repos: 8,
      followers: 9000,
    },
    null,
    2,
  ),
  elapsedMs: 142,
  sizeBytes: 524,
  contentType: "application/json; charset=utf-8",
};

export function getScreenshotDemoPersisted(mainView: MainView): PersistedState {
  const local = createEnvironment("Local");
  local.variables = [
    createKeyValue({ key: "base_url", value: "http://localhost:8080", enabled: true }),
    createKeyValue({ key: "api_key", value: "dev-secret", enabled: true }),
  ];

  const production = createEnvironment("Production");
  production.variables = [
    createKeyValue({ key: "base_url", value: "https://api.example.com", enabled: true }),
    createKeyValue({ key: "api_key", value: "prod-secret", enabled: true }),
  ];

  const collection = createCollectionGroup("Pulse API");
  const healthRequest = createRequest({
    name: "Health check",
    method: "GET",
    url: "{{base_url}}/health",
  });
  const usersRequest = createRequest({
    name: "List users",
    method: "GET",
    url: "{{base_url}}/users",
  });
  const githubRequest = createRequest({
    name: "GitHub User",
    method: "GET",
    url: "https://api.github.com/users/octocat",
  });

  const requestTab = createTabState(githubRequest);
  requestTab.response = mockGithubResponse;

  const base = defaultPersistedState();
  return {
    ...base,
    collectionGroups: [collection],
    activeCollectionId: collection.id,
    collections: [
      createSavedRequest(healthRequest, { collectionId: collection.id, name: "Health check" }),
      createSavedRequest(usersRequest, { collectionId: collection.id, name: "List users" }),
    ],
    environments: [local, production],
    activeEnvironmentId: local.id,
    lastRequest: githubRequest,
    windowSessions: {
      main: buildWindowSession({
        tabs: [requestTab],
        activeTabId: requestTab.id,
        mainView,
        requestTab: "params",
        consoleOpen: false,
        responsePanelOpen: true,
        sidebarSearch: "",
      }),
    },
  };
}
