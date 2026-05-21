"use client";

type Props = {
  noIldMessage: string | null;
  showAnalysisComplete: boolean;
  redirectingTo2D: boolean;
};

export function UploadIntakeNotifications({
  noIldMessage,
  showAnalysisComplete,
  redirectingTo2D,
}: Props) {
  return (
    <>
      {noIldMessage && (
        <div className="safe-bottom fixed bottom-2 left-3 right-3 z-40 max-w-sm animate-in slide-in-from-right-10 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-500 shadow-lg sm:bottom-6 sm:left-auto sm:right-6">
          {noIldMessage}
        </div>
      )}

      {showAnalysisComplete && (
        <div className="safe-bottom fixed bottom-2 left-3 right-3 z-40 max-w-sm animate-in slide-in-from-right-10 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-500 shadow-lg sm:bottom-6 sm:left-auto sm:right-6">
          ✓ Analysis complete
        </div>
      )}

      {redirectingTo2D && (
        <div className="safe-bottom fixed bottom-14 left-3 right-3 z-40 max-w-sm animate-in slide-in-from-right-10 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-xs font-medium text-sky-400 shadow-lg sm:bottom-20 sm:left-auto sm:right-6">
          Opening 2D viewer...
        </div>
      )}
    </>
  );
}
