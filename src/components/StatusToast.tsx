import React from 'react';

interface StatusToastProps {
  statusText: string;
  isReady: boolean;
  errorText: string | null;
  onDismissError?: () => void;
}

export const StatusToast: React.FC<StatusToastProps> = ({
  statusText,
  isReady,
  errorText,
  onDismissError,
}) => {
  return (
    <>
      {statusText && (
        <div
          id="status"
          className={`status-badge ${isReady ? 'ready' : ''}`}
        >
          {statusText}
        </div>
      )}

      {errorText && (
        <div id="error" className="error-banner flex justify-between items-start">
          <div className="flex-1 whitespace-pre-wrap">{errorText}</div>
          {onDismissError && (
            <button
              onClick={onDismissError}
              className="ml-3 text-xs font-bold text-amber-900 underline cursor-pointer"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </>
  );
};
