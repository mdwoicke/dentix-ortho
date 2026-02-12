/**
 * Dominos Integration Types
 * TypeScript interfaces for the Domino's Order Service proxy
 */

export interface DominosDashboardStats {
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  successRate: number;
  totalRevenue: number;
  averageOrderValue: number;
  averageResponseTime: number;
  uniqueSessions: number;
  period: string;
}

/** Matches api_logs table columns returned from the list endpoint (no bodies) */
export interface DominosOrderLog {
  id: number;
  timestamp: string;
  timestamp_cst?: string;
  session_id: string;
  request_id: string;
  method: string;
  endpoint: string;
  status_code: number;
  response_time_ms: number;
  error_message: string | null;
  user_agent: string;
  ip_address: string;
  store_id: string | null;
  order_total: number;
  items_count: number;
  success: number; // 0 or 1
}

/** Full log detail returned by /logs/:id - includes bodies + enriched fields */
export interface DominosLogDetail extends DominosOrderLog {
  request_body: unknown | null;
  response_body: unknown | null;
  error_stack?: string | null;
  errors?: { type: string; message: string; stack?: string }[];
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  order_type?: string | null;
  order_summary?: string | null;
  payment_type?: string | null;
  delivery_instructions?: string | null;
  ai_agent_order_output?: string | null;
  utterance?: string | null;
  call_type?: string | null;
  intent?: string | null;
  address_verified?: string | null;
  order_confirmed?: number;
}

/** Parsed order item with category and friendly names */
export interface ParsedOrderItem {
  categoryCode: string;
  category: string;
  code: string;
  name: string;
  quantity: number;
  options: string[];
  icon: string;
}

/** Fully parsed order from request body */
export interface ParsedOrder {
  summary: string;
  storeNumber: string;
  orderConfirmed: boolean;
  couponCode: string;
  sessionId: string;
  categories: { category: string; icon: string; items: ParsedOrderItem[] }[];
  totalItems: number;
}

export interface DominosPerformanceData {
  timestamp: string;
  avgResponseTime: number;
  requestCount: number;
  errorCount: number;
  successRate: number;
}

export interface DominosErrorBreakdown {
  error_type: string;
  count: number;
  percentage: number;
  last_occurred: string;
}

export interface DominosErrorByType {
  type: string;
  count: number;
  examples: string[];
}

export interface DominosHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | string;
  uptime: number;
  version: string;
  components: DominosHealthComponent[];
}

export interface DominosHealthComponent {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | string;
  responseTime?: number;
  details?: string;
}

export interface DominosSessionDetail {
  session_id: string;
  logs: DominosOrderLog[];
  summary: {
    totalCalls: number;
    successCount: number;
    failCount: number;
    totalResponseTime: number;
    startTime: string;
    endTime: string;
  };
}

export interface DominosMenuItem {
  code: string;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
}

export interface DominosOrderSubmission {
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  items: {
    code: string;
    quantity: number;
    options?: Record<string, string>;
  }[];
  paymentType: 'Cash' | 'Card';
  serviceMethod: 'Delivery' | 'Carryout';
}
