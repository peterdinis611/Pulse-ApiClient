import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { bootstrapTheme } from "./lib/theme-bootstrap";
import "./index.css";

async function main() {
  await bootstrapTheme();

  const root = document.getElementById("root");
  if (!root) {
    console.error("Pulse: #root element not found. The window did not load the app shell.");
    return;
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void main();
