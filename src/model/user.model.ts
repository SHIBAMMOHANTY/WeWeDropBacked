
export type Role = 'SUPER_ADMIN' | 'USER' | 'BUSINESS' | 'DELIVERY_AGENT';

export interface DeliveryAgent {
	id: string;
	phone: string;
	username?: string;
	email?: string;
	isActive: boolean;
	createdAt: Date;
	avatar?: string;
}
