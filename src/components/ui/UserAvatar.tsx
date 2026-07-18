interface UserAvatarProps {
  src: string | null | undefined;
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export function UserAvatar({ src, name, size = "md" }: UserAvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? "User"}
        className={`${sizeClasses[size]} rounded-full object-cover ring-1 ring-zinc-200`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-amber-500 flex items-center justify-center font-bold text-white`}
    >
      {getInitials(name)}
    </div>
  );
}
