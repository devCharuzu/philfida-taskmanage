-- ============================================================
-- TaskFlow Storage RLS Patch for Anonymous (Manual) Login
-- Run this in the Supabase SQL Editor
-- ============================================================

-- This allows manual login users (who operate as 'anon' role in Supabase)
-- to upload, update, and delete files in the taskflow-files bucket.

CREATE POLICY "Anon users can upload files" ON storage.objects 
FOR INSERT TO anon WITH CHECK (
  bucket_id = 'taskflow-files'
);

CREATE POLICY "Anon users can update files" ON storage.objects 
FOR UPDATE TO anon USING (
  bucket_id = 'taskflow-files'
);

CREATE POLICY "Anon users can delete files" ON storage.objects 
FOR DELETE TO anon USING (
  bucket_id = 'taskflow-files'
);

SELECT 'Storage anon policies applied successfully ✓' as status;
