// This function gets the access token from localStorage
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null; // Safety check for SSR
  return localStorage.getItem("access_token");
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("access_token", accessToken);
  localStorage.setItem("refresh_token", refreshToken);
}

// This function tells us if the user is "logged in"
// For now we just check if an access token exists
export function isAuthenticated(): boolean {
  return !!getAccessToken(); // !! turns a value into true/false
}

// This function logs the user out
// It removes tokens from localStorage
export function logout(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}
