export type ContentType = "before_after" | "listicle" | "visual_guide";
export type PinStatus = "pending" | "generating" | "uploading" | "scheduled" | "posted" | "failed";
export type AccountStatus = "active" | "paused";

export interface PinterestAccount {
  id: string;
  name: string;
  pinterest_username: string | null;
  postiz_api_key: string;
  postiz_integration_id: string;
  board_id: string;
  content_type: ContentType;
  status: AccountStatus;
  pins_per_day: number;
  telegram_chat_id: string | null;
  app_store_url: string;
  running: boolean;
  created_at: string;
}

export type ScheduleStatus = "pending" | "processing" | "done" | "failed" | "skipped";

export interface PinterestSchedule {
  id: string;
  account_id: string;
  scheduled_at: string;
  pin_id: string | null;
  status: ScheduleStatus;
  created_at: string;
}

export interface PinterestPin {
  id: string;
  account_id: string;
  topic_id: string;
  title: string;
  description: string;
  image_url: string | null;
  postiz_post_id: string | null;
  scheduled_at: string | null;
  status: PinStatus;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export interface PinterestTopic {
  id: string;
  category: ContentType;
  title_template: string;
  description_template: string;
  prompt_seed: string;
  times_used?: number;
  last_used_at?: string | null;
  created_at?: string;
}

export interface SchedulePinParams {
  integrationId: string;
  boardId: string;
  imageUrl: string;
  imageId?: string;
  title: string;
  description: string;
  scheduledAt: string;
  appStoreUrl: string;
  tags?: string[];
}
