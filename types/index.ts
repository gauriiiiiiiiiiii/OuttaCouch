export type EventCategory =
  | "Music"
  | "Sports"
  | "Art"
  | "Food"
  | "Networking"
  | "Outdoors"
  | "Comedy"
  | "Workshop"
  | "Fitness"
  | "Gaming"
  | "Other";

export type EventSummary = {
  id: string;
  title: string;
  category: EventCategory;
  date: string;
  location: string;
  imageUrl?: string;
  lat?: number | null;
  lng?: number | null;
};
