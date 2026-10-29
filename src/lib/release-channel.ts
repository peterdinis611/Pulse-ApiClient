import { readStorageItem, writeStorageItem } from "@/lib/app-config";

const KEY = "release-channel-v1";
export const RELEASE_CHANNEL_EVENT = "pulse:release-channel";

export type ReleaseChannel = "stable" | "beta";

/** Features that only ship on the beta channel. */
export type BetaFeature =
  | "git_commit"
  | "contract_panel"
  | "mock_matchers"
  | "agent_write_tools";

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

export function isBetaChannel(channel = loadReleaseChannel()): boolean {
  return channel === "beta";
}

export function isBetaFeatureEnabled(
  _feature: BetaFeature,
  channel = loadReleaseChannel(),
): boolean {
  return isBetaChannel(channel);
}
