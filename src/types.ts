import { Timestamp } from 'firebase/firestore';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  currentBalance: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ActivityType = 
  | 'Prepaid GA'
  | 'Recharge'
  | 'Home Internet New'
  | 'Home Internet Recharge'
  | 'Device & Accessory'
  | 'SmartNas'
  | 'GA-eSIM'
  | 'Change SIM';

export const ACTIVITY_POINTS: Record<ActivityType, number> = {
  'Prepaid GA': 1.0,
  'Recharge': 1.0,
  'Home Internet New': 2.0,
  'Home Internet Recharge': 2.0,
  'Device & Accessory': 0.5,
  'SmartNas': 2.0,
  'GA-eSIM': 2.0,
  'Change SIM': 2.0,
};

export interface SaleItem {
  activityType: ActivityType;
  value: number; // The quantity or USD amount
  points: number; // Resulting points for this item
}

export interface SaleRecord {
  id: string;
  agentName: string;
  customerPhone: string;
  items: SaleItem[];
  totalAmount: number;
  totalPoints: number;
  status: 'success' | 'failed' | 'pending';
  timestamp: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TariffType = string;

export interface TopUpRecord {
  id: string;
  customerId: string;
  agentName: string;
  customerName: string;
  topUpNumber: string;
  contact: string;
  tariff: TariffType;
  amount: number;
  points: number;
  renewDate: Timestamp;
  period: number; // in days
  expiryDate: Timestamp;
  status: 'success' | 'failed' | 'pending';
  paymentMethod: string;
  timestamp: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
