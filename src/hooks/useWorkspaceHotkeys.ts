import { useHotkeys } from "@tanstack/react-hotkeys";
import { useApp } from "@/machines";
import { focusPulseFieldWhenReady, PULSE_HOTKEYS } from "@/lib/hotkeys";
import { createAppWindow, openOverviewWindow } from "@/lib/window-manager";

const SHARED = { conflictBehavior: "replace" as const };

export function useWorkspaceHotkeys() {
  const {
    mainView,
    consoleOpen,
    setConsoleOpen,
    activeTabId,
    toggleExplorerCollapsed,
    explorerCollapsed,
    newRequestTab,
    closeTab,
    setMainView,
  } = useApp();

  useHotkeys(
    [
      {
        hotkey: PULSE_HOTKEYS.toggleExplorer,
        callback: () => toggleExplorerCollapsed(),
        options: { meta: { name: "Toggle explorer" } },
      },
      {
        hotkey: PULSE_HOTKEYS.toggleConsole,
        callback: () => setConsoleOpen(!consoleOpen),
        options: { meta: { name: "Toggle console" } },
      },
      {
        hotkey: PULSE_HOTKEYS.newWindow,
        callback: () => {
          void createAppWindow();
        },
        options: { meta: { name: "New window" } },
      },
      {
        hotkey: PULSE_HOTKEYS.overviewWindow,
        callback: () => {
          void openOverviewWindow();
        },
        options: { meta: { name: "Overview window" } },
      },
      {
        hotkey: PULSE_HOTKEYS.newTab,
        callback: () => {
          newRequestTab();
          focusPulseFieldWhenReady("url");
        },
        options: { meta: { name: "New request tab" } },
      },
      {
        hotkey: PULSE_HOTKEYS.closeTab,
        callback: () => {
          if (activeTabId) closeTab(activeTabId);
        },
        options: { meta: { name: "Close tab" } },
      },
      {
        hotkey: PULSE_HOTKEYS.focusUrl,
        callback: () => {
          if (mainView !== "request") setMainView("request");
          focusPulseFieldWhenReady("url");
        },
        options: { meta: { name: "Focus URL" } },
      },
      {
        hotkey: PULSE_HOTKEYS.focusSearch,
        callback: () => {
          if (mainView === "overview") {
            focusPulseFieldWhenReady("overview-search");
            return;
          }
          if (mainView !== "request") setMainView("request");
          if (explorerCollapsed) toggleExplorerCollapsed();
          focusPulseFieldWhenReady("explorer-search");
        },
        options: { meta: { name: "Search" } },
      },
    ],
    SHARED,
  );
}
