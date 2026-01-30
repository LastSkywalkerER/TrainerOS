import { useEffect, useState, useRef } from 'react';

export interface TutorialStep {
  target: string; // CSS selector или data-tutorial-id
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface TutorialGuideProps {
  steps: TutorialStep[];
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialGuide({ steps, isActive, onComplete, onSkip }: TutorialGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || steps.length === 0) {
      return;
    }

    const updateTargetPosition = () => {
      const step = steps[currentStep];
      if (!step) return;

      let element: Element | null = null;

      // Try to find element by data-tutorial-id first (if target starts with #)
      if (step.target.startsWith('#')) {
        const id = step.target.slice(1);
        element = document.querySelector(`[data-tutorial-id="${id}"]`) || document.getElementById(id);
      } else {
        element = document.querySelector(step.target);
      }

      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    };

    updateTargetPosition();

    // Update on scroll/resize
    window.addEventListener('scroll', updateTargetPosition, true);
    window.addEventListener('resize', updateTargetPosition);

    return () => {
      window.removeEventListener('scroll', updateTargetPosition, true);
      window.removeEventListener('resize', updateTargetPosition);
    };
  }, [isActive, currentStep, steps]);

  useEffect(() => {
    if (!isActive) {
      setCurrentStep(0);
      setTargetRect(null);
    }
  }, [isActive]);

  if (!isActive || steps.length === 0 || currentStep >= steps.length) {
    return null;
  }

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    // Close on any click outside the tooltip
    if (e.target === overlayRef.current) {
      onComplete();
    }
  };

  // Calculate tooltip position
  let tooltipStyle: React.CSSProperties = {};
  let arrowStyle: React.CSSProperties = {};

  if (targetRect) {
    const position = step.position || 'bottom';
    const spacing = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 120;

    switch (position) {
      case 'top':
        tooltipStyle = {
          bottom: window.innerHeight - targetRect.top + spacing,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        };
        arrowStyle = {
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          borderTopColor: 'white',
          borderBottomColor: 'transparent',
        };
        break;
      case 'bottom':
        tooltipStyle = {
          top: targetRect.bottom + spacing,
          left: targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        };
        arrowStyle = {
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          borderBottomColor: 'white',
          borderTopColor: 'transparent',
        };
        break;
      case 'left':
        tooltipStyle = {
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          right: window.innerWidth - targetRect.left + spacing,
        };
        arrowStyle = {
          left: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          borderLeftColor: 'white',
          borderRightColor: 'transparent',
        };
        break;
      case 'right':
        tooltipStyle = {
          top: targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          left: targetRect.right + spacing,
        };
        arrowStyle = {
          right: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          borderRightColor: 'white',
          borderLeftColor: 'transparent',
        };
        break;
      case 'center':
        tooltipStyle = {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };
        break;
    }

    // Ensure tooltip stays within viewport
    if (typeof tooltipStyle.left === 'number') {
      tooltipStyle.left = Math.max(16, Math.min(tooltipStyle.left, window.innerWidth - tooltipWidth - 16));
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 bg-black/60 transition-opacity duration-200"
      style={{ zIndex: 9999 }}
    >
      {/* Highlight target element */}
      {targetRect && (
        <div
          className="absolute border-4 border-blue-500 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] pointer-events-none transition-opacity duration-200"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 transition-all duration-200"
        style={{
          ...tooltipStyle,
          width: '320px',
          maxWidth: 'calc(100vw - 32px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow */}
        {targetRect && step.position !== 'center' && (
          <>
            {/* Light theme arrow */}
            <div
              className="absolute w-0 h-0 border-8 pointer-events-none dark:hidden"
              style={arrowStyle}
            />
            {/* Dark theme arrow */}
            <div
              className="absolute w-0 h-0 border-8 pointer-events-none hidden dark:block"
              style={{
                ...arrowStyle,
                borderTopColor: arrowStyle.borderTopColor === 'white' ? '#1f2937' : arrowStyle.borderTopColor,
                borderBottomColor: arrowStyle.borderBottomColor === 'white' ? '#1f2937' : arrowStyle.borderBottomColor,
                borderLeftColor: arrowStyle.borderLeftColor === 'white' ? '#1f2937' : arrowStyle.borderLeftColor,
                borderRightColor: arrowStyle.borderRightColor === 'white' ? '#1f2937' : arrowStyle.borderRightColor,
              }}
            />
          </>
        )}

        {/* Step indicator */}
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Шаг {currentStep + 1} из {steps.length}
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {step.title}
        </h3>

        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          {step.description}
        </p>

        {/* Buttons */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Пропустить
          </button>
          <button
            onClick={handleNext}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isLastStep ? 'Понятно' : 'Далее'}
          </button>
        </div>
      </div>
    </div>
  );
}
