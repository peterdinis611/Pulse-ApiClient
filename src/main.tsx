import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorScreen } from "./components/AppErrorScreen";
import { writeStorageItem } from "./lib/app-config";
import { bootstrapTheme } from "./lib/theme-bootstrap";
import { loadAndApplyCustomThemeCss } from "./lib/custom-theme";
import { bootstrapLocale } from "./lib/i18n";
import { loadAndApplyCustomLanguage } from "./lib/custom-language";
import { isScreenshotMode } from "./lib/screenshot-demo";
import "./index.css";

async function main() {
  const root = document.getElementById("root");
  if (!root) {
    console.error("Pulse: #root element not found. The window did not load the app shell.");
    return;
  }

  try {
    if (isScreenshotMode()) {
      writeStorageItem("locale", "en");
      writeStorageItem("theme", "light");
    }
    bootstrapLocale();
    await Promise.all([
      bootstrapTheme(),
      loadAndApplyCustomThemeCss(),
      loadAndApplyCustomLanguage().catch((error) => {
        console.warn("Failed to load custom language pack:", error);
      }),
    ]);
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    const caught = error instanceof Error ? error : new Error(String(error));
    console.error("Pulse failed to start:", caught);
    ReactDOM.createRoot(root).render(<AppErrorScreen error={caught} onRetry={() => window.location.reload()} />);
  }
}

void main();
