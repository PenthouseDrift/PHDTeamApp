export function getDisplayName(
  member?: { name?: string | null; nickname?: string | null } | null,
  fallback = "Member"
): string {
  if (!member) return fallback;
  if (member.nickname && member.nickname.trim().length > 0) {
    return member.nickname.trim();
  }
  return member.name?.trim() || fallback;
}

export function getAdminFormattedName(
  member?: { name?: string | null; nickname?: string | null } | null,
  fallback = "Member"
): string {
  if (!member) return fallback;
  const name = member.name?.trim() || fallback;
  if (member.nickname && member.nickname.trim().length > 0) {
    return `${name} ("${member.nickname.trim()}")`;
  }
  return name;
}
