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
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface OldPhoneListingCreatePayload {
  phoneName: string;
  phoneModel: string;
  phoneStorage: string;
  phoneColor: string;
  phonePrice: number;
  description?: string;
  imeiNumber?: string;
  phoneOn?: boolean;
  displayWorking?: boolean;
  displayGlassDamage?: boolean;
  bodyCondition?: "GOOD" | "AVERAGE" | "BAD";
  simSlotsWorking?: boolean;
  volumeButtonsWorking?: boolean;
  fingerprintWorking?: boolean;
  cameraWorking?: boolean;
  speakerWorking?: boolean;
  financeKitAvailable?: boolean;
  accessories?: string[];
  warranty?: boolean;
  images?: string[];
  billImage?: string;
  purchaseDate?: string;
}

export interface OldPhoneListingResponse {
  id: string;
  listingId?: string | null;
  userId: string;
  businessId?: string | null;
  phoneName: string;
  phoneModel: string;
  phoneStorage: string;
  phoneColor: string;
  phonePrice: number;
  imeiNumber?: string | null;
  description?: string | null;
  isActive: boolean;
  isSold: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OldPhoneOrderCreatePayload {
  listingId: string;
  customerName: string;
  customerPhone: string;
  offerPrice: number;
  deliveryAddress?: string;
  deliveryDate?: string;
}

export interface OldPhoneOrderStatusUpdatePayload {
  deliveryStatus: number;
  remark?: string;
  feedback?: string;
  rating?: number;
}

export interface OldPhoneNotificationResponse {
  id: string;
  userId?: string;
  businessId?: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  relatedId?: string;
  createdAt: string;
}

export type DeliveryStatus = 0 | 1 | 2 | 3 | 4 | 5;
