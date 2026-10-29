function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = toBase64Url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(digest) };
}

export function generateOAuthState(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

const STATE_PREFIX = "pulse-oauth-state:";

export function storeOAuthState(requestId: string, state: string): void {
  try {
    sessionStorage.setItem(`${STATE_PREFIX}${requestId}`, state);
  } catch {
    // ignore quota / private mode
  }
}

export function consumeOAuthState(requestId: string): string | null {
  try {
    const key = `${STATE_PREFIX}${requestId}`;
    const value = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

export function buildOAuthAuthorizeUrl(input: {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  codeChallenge: string;
  state?: string;
}): string {
  const url = new URL(input.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.scope?.trim()) url.searchParams.set("scope", input.scope.trim());
  if (input.state?.trim()) url.searchParams.set("state", input.state.trim());
  return url.toString();
}

export function extractAuthCodeFromRedirect(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("code");
  } catch {
    if (!trimmed.includes("=") && !trimmed.includes("://")) return trimmed;
    return null;
  }
}

export function extractOAuthStateFromRedirect(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).searchParams.get("state");
  } catch {
    return null;
  }
}

export type OAuthDeviceCodeStart = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string | null;
  expiresIn: number;
  interval: number;
};

export async function startOAuthDeviceFlow(input: {
  deviceAuthorizationUrl: string;
  clientId: string;
  scope?: string | null;
  clientSecret?: string | null;
}): Promise<OAuthDeviceCodeStart> {
  const { invokeEffect } = await import("./effect/tauri");
  const { runEffect } = await import("./effect/run");
  return runEffect(
    invokeEffect<OAuthDeviceCodeStart>("start_oauth_device_flow", {
      request: {
        deviceAuthorizationUrl: input.deviceAuthorizationUrl,
        clientId: input.clientId,
        scope: input.scope ?? null,
        clientSecret: input.clientSecret ?? null,
      },
    }),
  );
}
