export type Role = 'ADMIN' | 'STAFF';

export interface Branch {
  id: string;
  name: string;
  address?: string;
  createdAt: string;
}

export interface Department {
  id: string;
  branchId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface Provider {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  isActive: boolean;
  departments: Pick<Department, 'id' | 'name'>[];
  createdAt: string;
}

export interface Product {
  id: string;
  providerId: string;
  name: string;
  unitType: string;
  barcode?: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export type ProviderProductSummary = Pick<Product, 'id' | 'name' | 'providerId' | 'barcode'>;

/**
 * AWAITING_CONFIRMATION: WhatsApp was opened for this order, but nobody has
 * said whether the message was actually sent. wa.me gives no receipt, so
 * this is as much as the app can know on its own.
 */
export type OrderStatus = 'DRAFT' | 'AWAITING_CONFIRMATION' | 'PUBLISHED';

export interface OrderItem {
  id: string;
  productId?: string;
  productNameSnapshot: string;
  unitType: string;
  quantity: number;
}

export interface Order {
  id: string;
  branchId: string;
  providerId: string;
  createdByUserId: string;
  status: OrderStatus;
  createdAt: string;
  publishedAt?: string;
  handedOffAt?: string;
  notificationSentAt?: string;
  items: OrderItem[];
  provider: Pick<Provider, 'id' | 'name' | 'phone'>;
}

export interface UserWithAccess {
  id: string;
  username: string;
  role: Role;
  providerAccess: { providerId: string }[];
}
