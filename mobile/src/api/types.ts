export type Role = 'ADMIN' | 'STAFF';

export interface Branch {
  id: string;
  name: string;
  address?: string;
  createdAt: string;
}

export interface Provider {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  isActive: boolean;
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

export type OrderStatus = 'DRAFT' | 'PUBLISHED';

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
  items: OrderItem[];
  provider: Pick<Provider, 'id' | 'name' | 'phone'>;
}

export interface UserWithAccess {
  id: string;
  username: string;
  role: Role;
  providerAccess: { providerId: string }[];
}
