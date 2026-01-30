import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface TutorialContextType {
  triggerTutorial: (page: string) => void;
  getTriggeredPage: () => string | null;
  clearTrigger: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [triggeredPage, setTriggeredPage] = useState<string | null>(null);

  const triggerTutorial = useCallback((page: string) => {
    setTriggeredPage(page);
  }, []);

  const getTriggeredPage = useCallback(() => {
    return triggeredPage;
  }, [triggeredPage]);

  const clearTrigger = useCallback(() => {
    setTriggeredPage(null);
  }, []);

  return (
    <TutorialContext.Provider value={{ triggerTutorial, getTriggeredPage, clearTrigger }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within TutorialProvider');
  }
  return context;
}
