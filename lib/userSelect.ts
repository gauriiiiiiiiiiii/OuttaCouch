/**
 * Fields the client is allowed to see about itself. `passwordHash`, Stripe ids
 * and deactivation timestamps never leave the server.
 */
export const selfUserSelect = {
  id: true,
  email: true,
  phone: true,
  displayName: true,
  bio: true,
  profilePhotoUrl: true,
  city: true,
  lat: true,
  lng: true,
  preferences: true,
  remindersEnabled: true,
  recommendationsEnabled: true,
  calendarVisibility: true,
  profileVisibility: true,
  profileComplete: true,
  isDeactivated: true,
  isVerifiedHost: true,
  createdAt: true,
  updatedAt: true
} as const;
