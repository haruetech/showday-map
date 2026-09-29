export type ShowdayEventSource =
  | "KOPIS"
  | "SEOUL_CULTURE"
  | "SEOUL_RESERVATION"
  | "CULTURE_PORTAL"
  | "TOUR_API"
  | "YOUTH_PROGRAM"
  | "FOREST_EDU"
  | "MCST_EXHIBITION";

export type ShowdayEventCategory =
  | "공연"
  | "전시"
  | "축제·지역행사"
  | "체험·교육"
  | "무료행사"
  | "기타";

export interface ShowdayEvent {
  id: string;
  source: ShowdayEventSource;
  sourceId: string;
  title: string;
  category: ShowdayEventCategory;
  subcategory?: string;
  region?: string;
  district?: string;
  venue?: string;
  address?: string;
  startDate?: string | null;
  endDate?: string | null;
  applyStartDate?: string | null;
  applyEndDate?: string | null;
  dateText?: string;
  priceText?: string;
  priceValue?: number | null;
  isFree?: boolean;
  target?: string;
  ageText?: string;
  familyAllowed?: boolean | null;
  status?: string;
  bookingUrl?: string;
  officialUrl?: string;
  imageUrl?: string;
  organizer?: string;
  description?: string;
  lat?: number | null;
  lng?: number | null;
  updatedAt?: string | null;
  raw?: unknown;
}

export interface EventSourceResult {
  source: ShowdayEventSource;
  configured: boolean;
  events: ShowdayEvent[];
  error?: string;
}
