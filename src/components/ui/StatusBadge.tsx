interface StatusBadgeProps {
  status: "active" | "expired";
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-base px-3 py-1.5",
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
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${sizeClasses[size]} ${
        isActive
          ? "bg-green-500/10 text-green-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      <span
        className={`rounded-full ${dotSizeClasses[size]} ${
          isActive ? "bg-green-500" : "bg-red-500"
        }`}
        aria-hidden="true"
      />
      {isActive ? "Active" : "Expired"}
    </span>
  );
}
