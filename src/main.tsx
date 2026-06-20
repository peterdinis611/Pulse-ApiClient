import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorScreen } from "./components/AppErrorScreen";
import { bootstrapTheme } from "./lib/theme-bootstrap";
import { loadAndApplyCustomThemeCss } from "./lib/custom-theme";
import "./index.css";

async function main() {
  const root = document.getElementById("root");
  if (!root) {
    console.error("Pulse: #root element not found. The window did not load the app shell.");
    return;
  }

  try {
    await bootstrapTheme();
    await loadAndApplyCustomThemeCss();
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
