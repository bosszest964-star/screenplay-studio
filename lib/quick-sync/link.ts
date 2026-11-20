const deploymentPattern = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
const keyPattern = /^[a-f0-9]{64}$/;
export const pairingParameter = "quick-sync";
export const maxRelayBytes = 2 * 1024 * 1024;

export function validDeployment(endpoint: unknown): endpoint is string {
  return typeof endpoint === "string" && deploymentPattern.test(endpoint);
}

export function validPairingKey(key: unknown): key is string {
  return typeof key === "string" && keyPattern.test(key);
}

export function newPairingKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface SyncLink { endpoint: string; key: string }

export function createPairingLink(origin: string, { endpoint, key }: SyncLink) {
  const url = new URL("/", origin);
  url.hash = new URLSearchParams({ [pairingParameter]: endpoint + "#" + key }).toString();
  return url.href;
}

export function readPairingLink(hash: string): SyncLink | undefined {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get(pairingParameter);
  const [endpoint, key] = value?.split("#") ?? [];
  return validDeployment(endpoint) && validPairingKey(key) ? { endpoint, key } : undefined;
}
