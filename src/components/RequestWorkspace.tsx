import { useApp } from "@/machines";
import { RequestBar } from "@/components/RequestBar";
import { RequestTabs } from "@/components/RequestTabs";
import { ResponsePanel } from "@/components/ResponsePanel";
import { ResizableSplit } from "@/components/ResizableSplit";

export function RequestWorkspace() {
  const { responsePanelOpen } = useApp();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <RequestBar />
      {responsePanelOpen ? (
        <ResizableSplit top={<RequestTabs />} bottom={<ResponsePanel />} />
      ) : (
        <RequestTabs />
      )}
    </div>
  );
}
