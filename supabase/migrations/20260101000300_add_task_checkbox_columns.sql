-- Add checkbox columns to Tasks table to store structured checkbox data
-- This allows accurate fetching of checkbox states from director dispatch

ALTER TABLE public."Tasks"
ADD COLUMN IF NOT EXISTS "PriorityFlags" TEXT DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "PurposeCheckboxes" TEXT DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "ApprovalAction" TEXT DEFAULT '';

-- PriorityFlags: JSON array of selected priority flags (e.g., '["Urgent","Priority","Confidential"]')
-- PurposeCheckboxes: JSON array of selected purpose checkboxes (e.g., '["For compliance","For appropriate action"]')
-- ApprovalAction: Single approval action value (e.g., 'Noted', 'Approved', 'Disapproved', or empty string)
