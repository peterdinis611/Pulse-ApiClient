import { useEffect, useState } from "react";
import {
  RELEASE_CHANNEL_EVENT,
  loadReleaseChannel,
  type ReleaseChannel,
} from "@/lib/release-channel";

export function useReleaseChannel(): ReleaseChannel {
  const [channel, setChannel] = useState<ReleaseChannel>(() => loadReleaseChannel());

  useEffect(() => {
    const sync = () => setChannel(loadReleaseChannel());
    window.addEventListener(RELEASE_CHANNEL_EVENT, sync);
    return () => window.removeEventListener(RELEASE_CHANNEL_EVENT, sync);
  }, []);

  return channel;
}
