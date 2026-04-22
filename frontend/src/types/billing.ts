export type BillingTool = {
  key: string;
  name: string;
  description?: string;
  entitled: boolean;
  selected?: boolean;
};

export type AccessPass = {
  key: "bronze" | "silver" | "gold" | "platinum";
  name: string;
  tool_limit: number;
  monthly_price_cents: number;
};

export type BillingOrder = {
  id: number;
  local_number: string;
  invoice_number: string;
  stripe_invoice_id: string;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  currency: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  amount_remaining_cents: number;
  stripe_created_at: string | null;
  hosted_invoice_url: string;
  invoice_pdf_url: string;
};

export type BillingOrderLineItem = {
  description: string;
  amount_cents: number;
  currency: string;
  quantity: number;
  period_start: string | null;
  period_end: string | null;
};

export type BillingOrderDetail = BillingOrder & {
  billing_reason: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  paid_at: string | null;
  stripe_payment_intent_id: string;
  stripe_charge_id: string;
  subscription: {
    id: number;
    local_number: string;
    status: "pending" | "active" | "on_hold" | "canceled";
    access_pass: AccessPass | null;
  } | null;
  line_items: BillingOrderLineItem[];
};

export type BillingSummary = {
  status: "pending" | "active" | "on_hold" | "canceled";
  is_read_only: boolean;
  current_period_end: string | null;
  next_billing_date: string | null;
  current_pass: AccessPass | null;
  scheduled_pass: AccessPass | null;
  scheduled_change_effective_at: string | null;
  selected_tools_count: number;
  selected_tool_keys: string[];
  tools: BillingTool[];
  orders: BillingOrder[];
  stripe_customer_id: string;
  internal_discount_note?: string;
};

export type BillingPassesResponse = {
  passes: AccessPass[];
};

export type BillingPassActionResponse = {
  status: string;
  payment_action_required?: boolean;
  payment_url?: string | null;
  payment_intent_status?: string | null;
  summary?: BillingSummary;
};
