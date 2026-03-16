-- Run this in Supabase SQL Editor to add Lemon8 columns

alter table daily_metrics
  add column if not exists lm8_followers int default 0,
  add column if not exists lm8_following int default 0,
  add column if not exists lm8_total_likes int default 0,
  add column if not exists lm8_posts int default 0;
