import type { HttpResponse } from "@/types";
import { timingPhases } from "@/lib/timing";
import { cn } from "@/lib/utils";

type TimingWaterfallProps = {
  response: HttpResponse;
};

export function TimingWaterfall({ response }: TimingWaterfallProps) {
  if (response.fromCache) return null;

  const phases = timingPhases(response);
  const total = Math.max(1, phases.find((phase) => phase.id === "total")?.ms ?? response.elapsedMs);

  return (
    <div className="timing-waterfall">
      {phases.map((phase) => (
        <div key={phase.id} className="timing-waterfall-row" title={phase.hint}>
          <span className="timing-waterfall-label">{phase.label}</span>
          <div className="timing-waterfall-track">
            <span
              className={cn(
                "timing-waterfall-fill",
                phase.id === "total" && "timing-waterfall-fill--total",
              )}
              style={{
                marginLeft: `${(phase.offsetMs / total) * 100}%`,
                width: `${Math.max(1.5, (phase.ms / total) * 100)}%`,
              }}
            />
          </div>
          <span className="timing-waterfall-ms">{phase.ms} ms</span>
        </div>
      ))}
    </div>
  );
}
