export type ErrorPresentation = {
  title: string;
  description: string;
  hint?: string;
};

export function getErrorPresentation(error: Error): ErrorPresentation {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (message.includes("actorprovider") || message.includes("actor context")) {
    return {
      title: "Workspace engine did not start",
      description:
        "The app shell loaded, but the internal state manager was not ready. This can happen after an interrupted update or a hot reload in development.",
      hint: "Try again or reload the app. Your saved workspace stays on this device.",
    };
  }

  if (message.includes("tauri") || message.includes("invoke")) {
    return {
      title: "Desktop services unavailable",
      description:
        "Pulse could not reach the local desktop backend. Some features only work in the desktop app.",
      hint: "Reload the window or restart Pulse if the problem continues.",
    };
  }

  if (name.includes("chunk") || message.includes("dynamically imported module")) {
    return {
      title: "App update did not finish loading",
      description: "A part of the interface failed to download or initialize.",
      hint: "Reload the app to fetch a fresh copy.",
    };
  }

  return {
    title: "Something went wrong",
    description: "Pulse hit an unexpected error while starting or rendering the workspace.",
    hint: "Try again first. If the error keeps coming back, reload the app.",
  };
}

export function formatErrorDetails(error: Error): string {
  const stack = error.stack?.trim();
  if (stack && stack !== error.message) {
    return `${error.name}: ${error.message}\n\n${stack}`;
  }
  return `${error.name}: ${error.message}`;
}
