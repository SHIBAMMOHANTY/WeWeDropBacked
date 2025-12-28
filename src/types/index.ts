// Shared TypeScript types

export interface Business {
  id: string;
  email: string;
  password: string;
  approved: boolean;
  // Add other business fields as needed
}

export interface AuthTokenPayload {
  id: string;
  role: string;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}