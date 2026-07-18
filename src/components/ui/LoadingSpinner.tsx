interface LoadingSpinnerProps {
  text?: string;
}

export function LoadingSpinner({ text }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div
        className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin"
        role="status"
        aria-label="Loading"
      />
      {text && <p className="text-sm text-zinc-400">{text}</p>}
    </div>
  );
}
