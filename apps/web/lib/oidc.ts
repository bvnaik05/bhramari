export type AuthConfig = {
  mode: "demo" | "oidc";
  client_id?: string;
  authorization_url?: string;
  token_url?: string;
  scopes?: string;
};

const redirectUri = () => `${window.location.origin}/workspace`;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

export async function beginOidc(config: AuthConfig) {
  if (!config.authorization_url || !config.client_id) throw new Error("Institutional sign-in is not configured.");
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const state = encode(crypto.getRandomValues(new Uint8Array(24)));
  const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem("bhramari.oidc.verifier", verifier);
  sessionStorage.setItem("bhramari.oidc.state", state);
  const query = new URLSearchParams({
    response_type: "code", client_id: config.client_id, redirect_uri: redirectUri(),
    scope: config.scopes || "openid profile email", state, code_challenge: challenge, code_challenge_method: "S256",
  });
  window.location.assign(`${config.authorization_url}?${query}`);
}

export async function finishOidc(config: AuthConfig, code: string, state: string) {
  const verifier = sessionStorage.getItem("bhramari.oidc.verifier");
  const expected = sessionStorage.getItem("bhramari.oidc.state");
  sessionStorage.removeItem("bhramari.oidc.verifier");
  sessionStorage.removeItem("bhramari.oidc.state");
  if (!verifier || !expected || state !== expected) throw new Error("The sign-in response could not be verified. Please start again.");
  if (!config.token_url || !config.client_id) throw new Error("Institutional sign-in is not configured.");
  const response = await fetch(config.token_url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
    grant_type: "authorization_code", client_id: config.client_id, code, redirect_uri: redirectUri(), code_verifier: verifier,
  }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "The identity provider rejected the sign-in response.");
  return result.access_token as string;
}
