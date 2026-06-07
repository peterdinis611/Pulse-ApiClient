import { Suspense, lazy } from "react";
import { useApp } from "@/machines";
import { isWebSocketProtocol } from "@/lib/protocol";
import { LoadingScreen } from "@/components/LoadingScreen";
import { RequestBar } from "@/components/RequestBar";
import { ResizableSplit } from "@/components/ResizableSplit";

const RequestTabs = lazy(() =>
  import("@/components/RequestTabs").then((module) => ({ default: module.RequestTabs })),
);
const ResponsePanel = lazy(() =>
  import("@/components/ResponsePanel").then((module) => ({ default: module.ResponsePanel })),
);
const WebSocketPanel = lazy(() =>
  import("@/components/WebSocketPanel").then((module) => ({ default: module.WebSocketPanel })),
);

export function RequestWorkspace() {
  const { responsePanelOpen, request } = useApp();
  const isWebSocket = isWebSocketProtocol(request.protocol);

  const requestTabs = (
    <Suspense fallback={<LoadingScreen variant="inline" label="Loading request" />}>
      <RequestTabs />
    </Suspense>
  );

  const responsePanel = (
    <Suspense fallback={<LoadingScreen variant="inline" label="Loading panel" />}>
      {isWebSocket ? <WebSocketPanel /> : <ResponsePanel />}
    </Suspense>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <RequestBar />
      {responsePanelOpen ? (
        <ResizableSplit top={requestTabs} bottom={responsePanel} />
      ) : (
        requestTabs
      )}
    </div>
  );
}
