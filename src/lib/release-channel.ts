import { readStorageItem, writeStorageItem } from "@/lib/app-config";

const KEY = "release-channel-v1";
export const RELEASE_CHANNEL_EVENT = "pulse:release-channel";

export type ReleaseChannel = "stable" | "beta";

export function loadReleaseChannel(): ReleaseChannel {
  try {
    const raw = readStorageItem(KEY);
    return raw === "beta" ? "beta" : "stable";
  } catch {
    return "stable";
  }
}

export function saveReleaseChannel(channel: ReleaseChannel): ReleaseChannel {
  writeStorageItem(KEY, channel);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RELEASE_CHANNEL_EVENT));
  }
  return channel;
}
