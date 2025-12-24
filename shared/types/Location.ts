/**
 * Shared Location types
 * Used by both frontend and backend
 */

export interface Location {
  guid: string;
  name: string;
  code: string;
  timeZone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  phoneNumber?: string;
}

export interface LocationListResponse {
  locations: Location[];
  count: number;
}
