export interface UserProfile {
  id: string;
  email: string;
  name: string;
  emoji: string;
  color: string;
  avatarUrl?: string | null;
  plan: string;
  planExpiry: string | null;
  createdAt: string;
  isPremium: boolean;
  stats: {
    trips: number;
    ownedTrips: number;
    photos: number;
    totalSpent: number;
    journals: number;
    messages: number;
    visitedPlaces: number;
  };
  limits: {
    maxOwnedTrips: number | null;
    maxMembersPerTrip: number | null;
    canCreateTrip: boolean;
  };
  trips: TripInfo[];
  achievements: { emoji: string; label: string; req: string; unlocked: boolean }[];
}

export interface TripInfo {
  id: string;
  title: string;
  destination: string;
  coverColor: string;
  coverEmoji: string;
  startDate: string;
  endDate: string | null;
  totalDays: number;
  status: string;
  inviteCode: string;
  role: string;
  members: number;
  places: number;
  photos: number;
  expenses: number;
  journals: number;
}
