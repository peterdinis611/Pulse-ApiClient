import { Effect } from "effect";
import type { UserSession } from "./auth";
import { loadUserSession } from "./auth";
import { runEffect } from "./effect/run";
import {
  getScreenshotDemoPersisted,
  getScreenshotMainView,
  isScreenshotMode,
  SCREENSHOT_DEMO_USER,
} from "./screenshot-demo";
import { defaultPersistedState, loadPersistedState, type PersistedState } from "./storage";
import { canUseTauriIpc } from "./tauri-runtime";
import { getCurrentWindowLabel, takePendingWindowInit } from "./window-manager";

export type AppBootstrapData = {
  persisted: PersistedState;
  user: UserSession | null;
  windowId: string;
  pendingInit: Awaited<ReturnType<typeof takePendingWindowInit>>;
};

function loadWindowContextEffect(): Effect.Effect<{
  windowId: string;
  pendingInit: Awaited<ReturnType<typeof takePendingWindowInit>>;
}> {
  return Effect.promise(async () => {
    if (!canUseTauriIpc()) {
      return { windowId: "main", pendingInit: null };
    }

    try {
      const label = await getCurrentWindowLabel();
      const pendingInit = await takePendingWindowInit(label);
      return { windowId: label, pendingInit };
    } catch {
      return { windowId: "main", pendingInit: null };
    }
  });
}

function loadPersistedStateEffect() {
  return Effect.tryPromise({
    try: () => loadPersistedState(),
    catch: () => defaultPersistedState(),
  }).pipe(Effect.catchAll(() => Effect.succeed(defaultPersistedState())));
}

function loadUserSessionEffect() {
  return Effect.tryPromise({
    try: () => loadUserSession(),
    catch: () => null,
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
}

export function loadAppBootstrapDataEffect(
  useScreenshotDemo: boolean,
  screenshotMainView: ReturnType<typeof getScreenshotMainView>,
): Effect.Effect<AppBootstrapData, never> {
  if (useScreenshotDemo) {
    return Effect.succeed({
      persisted: getScreenshotDemoPersisted(screenshotMainView ?? "request"),
      user: SCREENSHOT_DEMO_USER,
      windowId: "main",
      pendingInit: null,
    });
  }

  return Effect.gen(function* () {
    const { persisted, user, windowContext } = yield* Effect.all(
      {
        persisted: loadPersistedStateEffect(),
        user: loadUserSessionEffect(),
        windowContext: loadWindowContextEffect(),
      },
      { concurrency: "unbounded" },
    );

    return {
      persisted,
      user,
      windowId: windowContext.windowId,
      pendingInit: windowContext.pendingInit,
    };
  });
}

export async function loadAppBootstrapData(): Promise<AppBootstrapData> {
  const useScreenshotDemo = isScreenshotMode() && !canUseTauriIpc();
  const screenshotMainView = useScreenshotDemo ? getScreenshotMainView() : null;
  return runEffect(
    loadAppBootstrapDataEffect(useScreenshotDemo, screenshotMainView ?? "request"),
  );
}
