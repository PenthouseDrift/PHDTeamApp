interface StatusBadgeProps {
  status: "active" | "expired";
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "text-xs px-2.5 py-0.5",
  md: "text-sm px-3 py-1",
  lg: "text-base px-3.5 py-1.5",
};

const dotSizeClasses = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const isActive = status === "active";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold rounded-full border ${sizeClasses[size]} ${
        isActive
          ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
          : "bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
      }`}
    >
      <span
        className={`rounded-full ${dotSizeClasses[size]} ${
          isActive ? "bg-green-500" : "bg-zinc-400 dark:bg-zinc-500"
        }`}
        aria-hidden="true"
      />
      {isActive ? "Member" : "User"}
    </span>
  );
}
