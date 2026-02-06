// Service Worker registration and update management
// Uses workbox-window for SW lifecycle management

import { Workbox } from 'workbox-window';

export type SwUpdateCallback = (updateAvailable: boolean) => void;

let wb: Workbox | null = null;
let registration: ServiceWorkerRegistration | null = null;
let updateCallbacks: SwUpdateCallback[] = [];

/** Check if service workers are supported */
export function isSwSupported(): boolean {
  return 'serviceWorker' in navigator;
}

/** Register the service worker and listen for updates */
export function registerSW(): void {
  // Skip SW registration in development mode (no sw.js file exists)
  if (import.meta.env.DEV) {
    return;
  }

  if (!isSwSupported()) {
    return;
  }

  wb = new Workbox('/sw.js');

  // New SW is waiting to activate
  wb.addEventListener('waiting', () => {
    console.log('[SW] New service worker waiting to activate');
    notifyUpdateAvailable(true);
  });

  // SW controlling the page has changed (after skipWaiting)
  wb.addEventListener('controlling', () => {
    console.log('[SW] New service worker is now controlling the page');
    // Reload to get the new version
    window.location.reload();
  });

  wb.register().then((reg) => {
    registration = reg || null;
    console.log('[SW] Service worker registered');
  }).catch((error) => {
    console.error('[SW] Service worker registration failed:', error);
  });
}

/** Subscribe to update availability notifications */
export function onUpdateAvailable(callback: SwUpdateCallback): () => void {
  updateCallbacks.push(callback);
  return () => {
    updateCallbacks = updateCallbacks.filter((cb) => cb !== callback);
  };
}

/** Notify all subscribers about update status */
function notifyUpdateAvailable(available: boolean): void {
  for (const cb of updateCallbacks) {
    cb(available);
  }
}

/** Apply pending update - activates waiting SW and reloads page */
export function applyUpdate(): void {
  if (wb) {
    // Tell the waiting SW to skip waiting
    wb.messageSkipWaiting();
  }
}

/**
 * Manually check for SW updates.
 * Returns true if a new SW was found, false otherwise.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) {
    return false;
  }

  try {
    await registration.update();
    // If there's a waiting SW after the update check, there's an update
    if (registration.waiting) {
      notifyUpdateAvailable(true);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[SW] Update check failed:', error);
    return false;
  }
}

/**
 * Force-clear all caches and reload. Use when SW update detection fails
 * or the app is stuck on an old cached version.
 */
export async function forceRefresh(): Promise<void> {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    console.log('[SW] All caches cleared');
  }

  // Unregister all service workers
  if (isSwSupported()) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
    console.log('[SW] All service workers unregistered');
  }

  // Hard reload
  window.location.reload();
}
