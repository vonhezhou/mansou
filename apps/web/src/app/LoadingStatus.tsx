export function LoadingStatus({ label }: { label: string }) {
  return (
    <span className="loading-status" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
