export function PageTabs<K extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  id: string;
  label: string;
  tabs: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div
      className="source-management-tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => {
        const current = tabs.findIndex((tab) => tab.key === value);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : event.key === "ArrowRight"
                ? (current + 1) % tabs.length
                : event.key === "ArrowLeft"
                  ? (current + tabs.length - 1) % tabs.length
                  : -1;
        if (next < 0) return;
        event.preventDefault();
        onChange(tabs[next].key);
        event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`${id}-${tab.key}-tab`}
          aria-controls={`${id}-${tab.key}-panel`}
          aria-selected={value === tab.key}
          tabIndex={value === tab.key ? 0 : -1}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
