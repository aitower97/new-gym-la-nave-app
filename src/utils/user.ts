export function getDisplayName(profile: {
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
}): string {
  return profile.username || profile.full_name || profile.email?.split('@')[0] || 'Usuario';
}
