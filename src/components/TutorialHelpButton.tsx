import { useLocation } from 'react-router-dom';
import { useTutorial } from '../contexts/TutorialContext';

/**
 * Maps current route to tutorial page id.
 * Returns null if current page has no tutorial.
 */
function getTutorialPageForRoute(pathname: string): string | null {
  if (pathname === '/clients' || pathname === '/') return 'clients';
  if (pathname.startsWith('/clients/') && pathname.endsWith('/edit')) return null;
  if (pathname.match(/^\/clients\/[^/]+$/)) return 'client-profile';
  if (pathname === '/calendar') return 'calendar';
  if (pathname === '/payments') return 'payments';
  if (pathname === '/summary') return 'summary';
  return null;
}

/**
 * Subtle help button shown on every page with a tutorial.
 * Fixed in bottom-left corner, low opacity until hover.
 */
export function TutorialHelpButton() {
  const location = useLocation();
  const { triggerTutorial } = useTutorial();
  const page = getTutorialPageForRoute(location.pathname);

  if (!page) return null;

  return (
    <button
      onClick={() => triggerTutorial(page)}
      className="fixed bottom-20 left-2 z-30 p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 opacity-40 hover:opacity-100 transition-opacity"
      title="Показать подсказки"
      aria-label="Показать подсказки"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>
  );
}
