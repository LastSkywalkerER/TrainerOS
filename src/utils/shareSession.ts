/**
 * Share session data encoding/decoding for URL-based sharing (no server).
 * Data is embedded in the URL as base64url-encoded JSON.
 */

export interface ShareSessionData {
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  notes?: string; // HTML from TipTap
  client_name?: string;
}

/** Encode share data to base64url string */
export function encodeShareData(data: ShareSessionData): string {
  const json = JSON.stringify(data);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url string to share data */
export function decodeShareData(encoded: string): ShareSessionData | null {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) {
      base64 += '='.repeat(4 - pad);
    }
    const json = decodeURIComponent(escape(atob(base64)));
    return JSON.parse(json) as ShareSessionData;
  } catch {
    return null;
  }
}

/** Build full share URL for the current origin */
export function buildShareUrl(data: ShareSessionData): string {
  const encoded = encodeShareData(data);
  const origin = window.location.origin;
  const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${base}/share?d=${encoded}`;
}
