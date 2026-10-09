import { useCallback } from "react";
import { useApp } from "@/machines";
import { isStreamProtocol } from "@/lib/protocol";
import {
  loadLayoutPreferences,
  saveLayoutPreferences,
  WORKSPACE_SPLIT_RATIO_DEFAULT,
} from "@/lib/layout-preferences";
import { RequestBar } from "@/components/RequestBar";
import { RequestTabs } from "@/components/RequestTabs";
import { ResponsePanel } from "@/components/ResponsePanel";
import { ResizableSplit } from "@/components/ResizableSplit";
import { WebSocketPanel } from "@/components/WebSocketPanel";

export function RequestWorkspace() {
  const { responsePanelOpen, request } = useApp();
  const isStream = isStreamProtocol(request.protocol);
  const splitRatio =
    loadLayoutPreferences().workspaceSplitRatio ?? WORKSPACE_SPLIT_RATIO_DEFAULT;

  const handleSplitRatioChange = useCallback((ratio: number) => {
    const prefs = loadLayoutPreferences();
    saveLayoutPreferences({ ...prefs, workspaceSplitRatio: ratio });
  }, []);

  const requestTabs = <RequestTabs />;
  const responsePanel = isStream ? <WebSocketPanel /> : <ResponsePanel />;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <RequestBar />
      {responsePanelOpen ? (
        <ResizableSplit
          top={requestTabs}
          bottom={responsePanel}
          initialRatio={splitRatio}
          onRatioChange={handleSplitRatioChange}
        />
      ) : (
        requestTabs
      )}
    </div>
  );
}
