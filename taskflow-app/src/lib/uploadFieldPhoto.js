import { supabase } from './supabase';

/**
 * Uploads a field photo to Supabase storage
 * @param {File} file - The file object from a file input
 * @param {string} taskId - The task ID (UUID) for organizing photos
 * @returns {Promise<Object>} Result object with success status
 * @returns {boolean} returns.success - True if upload succeeded
 * @returns {string} [returns.path] - Storage path if successful
 * @returns {string} [returns.error] - Error message if failed
 */
export async function uploadFieldPhoto(file, taskId) {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    return {
      success: false,
      error: 'File must be an image (JPEG, PNG, etc.)'
    };
  }

  // Validate file size (50MB limit)
  const maxSize = 50 * 1024 * 1024; // 50MB in bytes
  if (file.size > maxSize) {
    return {
      success: false,
      error: 'File size must be under 50MB'
    };
  }

  // Generate unique filename
  const fileExtension = file.name.split('.').pop();
  const uniqueFilename = `${crypto.randomUUID()}.${fileExtension}`;
  const uploadPath = `field-reports/${taskId}/${uniqueFilename}`;

  try {
    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('taskflow-files')
      .upload(uploadPath, file, {
        upsert: false,
        cacheControl: '3600'
      });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to upload file to storage'
      };
    }

    return {
      success: true,
      path: uploadPath
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'An unexpected error occurred during upload'
    };
  }
}
