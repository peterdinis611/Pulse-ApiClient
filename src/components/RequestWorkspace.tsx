import { useApp } from "@/machines";
import { isWebSocketProtocol } from "@/lib/protocol";
import { RequestBar } from "@/components/RequestBar";
import { RequestTabs } from "@/components/RequestTabs";
import { ResponsePanel } from "@/components/ResponsePanel";
import { WebSocketPanel } from "@/components/WebSocketPanel";
import { ResizableSplit } from "@/components/ResizableSplit";

export function RequestWorkspace() {
  const { responsePanelOpen, request } = useApp();
  const isWebSocket = isWebSocketProtocol(request.protocol);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <RequestBar />
      {responsePanelOpen ? (
        <ResizableSplit
          top={<RequestTabs />}
          bottom={isWebSocket ? <WebSocketPanel /> : <ResponsePanel />}
        />
      ) : (
        <RequestTabs />
      )}
    </div>
  );
}
