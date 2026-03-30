-- Add ba_running column for before/after Pinterest pipeline
-- Run this manually in Supabase SQL editor
ALTER TABLE pinterest_accounts ADD COLUMN ba_running boolean DEFAULT false;
