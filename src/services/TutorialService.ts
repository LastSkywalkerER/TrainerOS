export type TutorialPage = 'clients' | 'calendar' | 'payments' | 'summary' | 'client-profile';

interface TutorialState {
  clients: boolean;
  calendar: boolean;
  payments: boolean;
  summary: boolean;
  'client-profile': boolean;
}

const STORAGE_KEY = 'trainer-os-tutorial-completed';

class TutorialService {
  private getState(): TutorialState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load tutorial state:', error);
    }
    return {
      clients: false,
      calendar: false,
      payments: false,
      summary: false,
      'client-profile': false,
    };
  }

  private saveState(state: TutorialState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save tutorial state:', error);
    }
  }

  /**
   * Check if tutorial was completed for a specific page
   */
  isCompleted(page: TutorialPage): boolean {
    const state = this.getState();
    return state[page] === true;
  }

  /**
   * Mark tutorial as completed for a specific page
   */
  markCompleted(page: TutorialPage): void {
    const state = this.getState();
    state[page] = true;
    this.saveState(state);
  }

  /**
   * Reset tutorial for a specific page (allows showing it again)
   */
  reset(page: TutorialPage): void {
    const state = this.getState();
    state[page] = false;
    this.saveState(state);
  }

  /**
   * Reset all tutorials
   */
  resetAll(): void {
    this.saveState({
      clients: false,
      calendar: false,
      payments: false,
      summary: false,
      'client-profile': false,
    });
  }

  /**
   * Check if any tutorial was ever shown
   */
  hasAnyCompleted(): boolean {
    const state = this.getState();
    return Object.values(state).some((completed) => completed === true);
  }
}

export const tutorialService = new TutorialService();
