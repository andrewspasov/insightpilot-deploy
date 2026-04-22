export type CookieConsentStatus = "accepted" | "declined";

const CONSENT_KEY = "cookie_consent";
const NON_ESSENTIAL_COOKIES = ["sidebar:state"];

const isBrowser = typeof window !== "undefined";

export function getCookieConsentStatus(): CookieConsentStatus | null {
  if (!isBrowser) return null;
  const stored = window.localStorage.getItem(CONSENT_KEY);
  if (stored === "accepted" || stored === "declined") {
    return stored;
  }
  return null;
}

export function setCookieConsentStatus(status: CookieConsentStatus) {
  if (!isBrowser) return;
  window.localStorage.setItem(CONSENT_KEY, status);
}

export function hasAcceptedCookieConsent() {
  return getCookieConsentStatus() === "accepted";
}

export function clearNonEssentialCookies() {
  if (!isBrowser) return;
  NON_ESSENTIAL_COOKIES.forEach((name) => {
    document.cookie = `${name}=; path=/; max-age=0`;
  });
}
