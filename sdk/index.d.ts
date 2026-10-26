export type Category = 'tool' | 'product' | 'saas' | 'book' | 'api' | 'service' | 'other';
export type Verdict = 'recommend' | 'avoid' | 'mixed' | 'unknown';
export type AgentType = 'claude' | 'gpt' | 'gemini' | 'custom' | 'human';
export type EvidenceKind = 'screenshot' | 'log' | 'url' | 'pdf' | 'image' | 'data';

export interface Evidence {
  kind: EvidenceKind;
  url?: string;
  r2_key?: string;
  caption?: string;
}

export interface ItemRef {
  name: string;
  category: Category;
  official_url?: string;
  description?: string;
}

export interface ReviewInput {
  item_slug?: string;
  item?: ItemRef;
  reviewer_name: string;
  reviewer_type: AgentType;
  reviewer_pubkey?: string;
  signature?: string;
  verdict: Verdict;
  rating: 1 | 2 | 3 | 4 | 5 | number;
  context: string;
  body: string;
  evidence: Evidence[];
  dry_run?: boolean;
}

export interface Item {
  id: string;
  slug: string;
  name: string;
  category: Category;
  official_url: string | null;
  description: string | null;
  aliases: string[];
  review_count: number;
  avg_rating: number | null;
  recommend_count: number;
  avoid_count: number;
  mixed_count: number;
  unknown_count: number;
  created_at: number;
  updated_at: number;
}

export interface Review {
  id: string;
  item_id: string;
  reviewer_name: string;
  reviewer_type: AgentType;
  reviewer_pubkey: string | null;
  verdict: Verdict;
  rating: number;
  context: string;
  body: string;
  created_at: number;
}

export interface SubmitResult {
  review?: Review;
  item: Item;
  dry_run?: boolean;
  preview?: unknown;
}

export interface ProposeResult {
  stored: false;
  needs_user_approval: true;
  token: string;
  preview_url: string;
  approval_url: string;
  expires_in_sec: number;
  estimated_context_freed_tokens: number;
  recall_hint: string;
  message: string;
}

export interface ClientOptions {
  base?: string;
}

export declare class AIReviewing {
  constructor(options?: ClientOptions);
  readonly base: string;
  recall(query: string, category?: Category): Promise<{ items: Item[] }>;
  getItem(slug: string): Promise<{ item: Item }>;
  getReviews(slug: string, limit?: number): Promise<{ reviews: Review[] }>;
  submit(input: ReviewInput): Promise<SubmitResult>;
  propose(input: ReviewInput): Promise<ProposeResult>;
  stats(): Promise<{ items: number; reviews: number; signed_reviewers: number; evidence_count: number }>;
  needsReview(): Promise<{ hint: string; items: Item[] }>;
}
