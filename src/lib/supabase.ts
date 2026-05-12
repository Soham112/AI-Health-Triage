import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lazy — throws only on first use, not at module import time
// This allows the app to run without Supabase configured (mock data mode)
let _supabase: SupabaseClient | null = null;
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_supabase) {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
      }
      _supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_supabase as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// Admin client — server-side only, bypasses RLS
export function getServiceClient(): SupabaseClient {
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — admin client unavailable');
  }
  return createClient(supabaseUrl!, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type Database = {
  public: {
    Tables: {
      members: {
        Row: MemberRow;
        Insert: Omit<MemberRow, 'id' | 'created_at'>;
        Update: Partial<Omit<MemberRow, 'id'>>;
      };
      claims: {
        Row: ClaimRow;
        Insert: Omit<ClaimRow, 'id'>;
        Update: Partial<Omit<ClaimRow, 'id'>>;
      };
      triage_history: {
        Row: TriageHistoryRow;
        Insert: Omit<TriageHistoryRow, 'id'>;
        Update: Partial<Omit<TriageHistoryRow, 'id'>>;
      };
      chat_history: {
        Row: ChatHistoryRow;
        Insert: Omit<ChatHistoryRow, 'id'>;
        Update: Partial<Omit<ChatHistoryRow, 'id'>>;
      };
      preventive_campaigns: {
        Row: PreventiveCampaignRow;
        Insert: Omit<PreventiveCampaignRow, 'id'>;
        Update: Partial<Omit<PreventiveCampaignRow, 'id'>>;
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: Omit<AuditLogRow, 'id'>;
        Update: never;
      };
    };
  };
};

export interface MemberRow {
  id: string;
  age: number;
  gender: string;
  conditions: string[];
  medications: string[];
  risk_score: number;
  plan_type: string;
  enrollment_date: string;
  created_at: string;
}

export interface ClaimRow {
  id: string;
  member_id: string;
  date: string;
  diagnosis_code: string;
  procedure_code: string;
  cost: number;
  category: string;
  provider_type: string;
  paid_amount: number;
}

export interface TriageHistoryRow {
  id: string;
  member_id: string;
  symptoms: string;
  recommended_care: string;
  actual_care_used: string | null;
  cost_saved: number | null;
  confidence: number;
  date: string;
}

export interface ChatHistoryRow {
  id: string;
  member_id: string;
  message: string;
  response: string;
  timestamp: string;
  embedding: number[] | null;
}

export interface PreventiveCampaignRow {
  id: string;
  member_id: string;
  campaign_type: string;
  status: 'pending' | 'sent' | 'engaged' | 'completed' | 'declined';
  projected_savings: number;
  outcome: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AuditLogRow {
  id: string;
  action: string;
  user_id: string;
  resource: string;
  timestamp: string;
  details: Record<string, unknown>;
  ip_address: string | null;
}
