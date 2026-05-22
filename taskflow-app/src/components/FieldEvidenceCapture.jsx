import { useState, useRef, useEffect } from 'react';
import { useGeoLocation } from '../hooks/useGeoLocation';
import { uploadFieldPhoto } from '../lib/uploadFieldPhoto';
import { supabase } from '../lib/supabase';

export default function FieldEvidenceCapture({ taskId }) {
  if (!taskId) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error: taskId is required</p>
      </div>
    );
  }

  // GPS capture state
  const { location, status: gpsStatus, errorMessage: gpsError, capture: captureLocation } = useGeoLocation();

  // Photo evidence state
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [photoError, setPhotoError] = useState(null);
  const fileInputRef = useRef(null);

  // Field notes state
  const [fieldNotes, setFieldNotes] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [failedUploads, setFailedUploads] = useState([]);
  const [retryFromIndex, setRetryFromIndex] = useState(null);

  // iOS Safari detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // beforeunload warning for mid-upload navigation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isSubmitting) {
        e.preventDefault();
        e.returnValue = 'You have an upload in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSubmitting]);

  // Handle GPS capture
  const handleCaptureLocation = async () => {
    try {
      await captureLocation();
    } catch (err) {
      // Error is handled by the hook
    }
  };

  // Handle photo selection
  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    
    if (selectedPhotos.length + files.length > 5) {
      setPhotoError('Maximum 5 photos allowed');
      return;
    }

    // Convert files to base64 for preview (CSP compliant)
    // Use a more reliable approach with unique IDs to avoid race conditions
    const photoPromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            file,
            preview: e.target.result
          });
        };
        reader.onerror = () => {
          resolve({
            file,
            preview: null
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(photoPromises).then(newPhotos => {
      setSelectedPhotos(prev => [...prev, ...newPhotos]);
      setPhotoError(null);
    });
    
    // Clear the input so the same files can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove photo
  const handleRemovePhoto = (index) => {
    setSelectedPhotos(prev => {
      const newPhotos = [...prev];
      // Don't revokeObjectURL since we're using base64 data URLs, not blob URLs
      // URL.revokeObjectURL(newPhotos[index].preview);
      newPhotos.splice(index, 1);
      return newPhotos;
    });
  };

  // Handle field notes change
  const handleNotesChange = (e) => {
    const value = e.target.value;
    if (value.length <= 300) {
      setFieldNotes(value);
    }
  };

  // Handle submission
  const handleSubmit = async () => {
    if (!location || selectedPhotos.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    setFailedUploads([]);
    setRetryFromIndex(null);
    setUploadProgress({ current: 0, total: selectedPhotos.length });

    try {
      // Upload all photos one by one with progress tracking
      const photoPaths = [];
      const failedIndices = [];

      for (let i = 0; i < selectedPhotos.length; i++) {
        setUploadProgress({ current: i + 1, total: selectedPhotos.length });
        
        try {
          const result = await uploadFieldPhoto(selectedPhotos[i].file, taskId);
          if (result.success) {
            photoPaths.push(result.path);
          } else {
            failedIndices.push(i);
            setFailedUploads(prev => [...prev, { index: i, error: result.error }]);
          }
        } catch (uploadErr) {
          failedIndices.push(i);
          setFailedUploads(prev => [...prev, { index: i, error: uploadErr.message || 'Network error during upload' }]);
        }
      }

      // If some uploads failed, show error with retry option
      if (failedIndices.length > 0) {
        const failedMsg = `Failed to upload ${failedIndices.length} photo${failedIndices.length !== 1 ? 's' : ''}: ${failedIndices.map(i => `Photo ${i + 1}`).join(', ')}`;
        setSubmitError(failedMsg);
        setRetryFromIndex(failedIndices[0]);
        setIsSubmitting(false);
        return;
      }

      // Call the RPC function
      const { data, error } = await supabase.rpc('submit_field_report', {
        p_task_id: taskId,
        p_lat: location.lat,
        p_lng: location.lng,
        p_accuracy: location.accuracy,
        p_photo_paths: photoPaths,
        p_notes: fieldNotes
      });

      if (error) {
        throw new Error(error.message || 'Failed to submit field report');
      }

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to submit field report');
      }

      setSubmitSuccess(true);
      // Clear form on success
      setSelectedPhotos([]);
      setFieldNotes('');
      setFailedUploads([]);
      setRetryFromIndex(null);
    } catch (err) {
      setSubmitError(err.message || 'An error occurred during submission');
    } finally {
      setIsSubmitting(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  // Retry failed uploads from specific index
  const handleRetryFailed = async () => {
    if (retryFromIndex === null || failedUploads.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setFailedUploads([]);

    try {
      const photoPaths = [];
      const newFailedIndices = [];

      // Only retry the failed uploads
      for (const failed of failedUploads) {
        const photo = selectedPhotos[failed.index];
        if (!photo) continue;

        try {
          const result = await uploadFieldPhoto(photo.file, taskId);
          if (result.success) {
            photoPaths.push({ path: result.path, originalIndex: failed.index });
          } else {
            newFailedIndices.push(failed.index);
            setFailedUploads(prev => [...prev, { index: failed.index, error: result.error }]);
          }
        } catch (uploadErr) {
          newFailedIndices.push(failed.index);
          setFailedUploads(prev => [...prev, { index: failed.index, error: uploadErr.message || 'Network error during upload' }]);
        }
      }

      // If retry still failed, show error
      if (newFailedIndices.length > 0) {
        const failedMsg = `Retry failed for ${newFailedIndices.length} photo${newFailedIndices.length !== 1 ? 's' : ''}`;
        setSubmitError(failedMsg);
        setIsSubmitting(false);
        return;
      }

      // Get all successfully uploaded photos (original + retried)
      const allPhotoPaths = [];
      for (let i = 0; i < selectedPhotos.length; i++) {
        const retriedPath = photoPaths.find(p => p.originalIndex === i);
        if (retriedPath) {
          allPhotoPaths.push(retriedPath.path);
        } else {
          // This photo was successfully uploaded in the first attempt
          // We need to re-upload it since we don't have the path stored
          const result = await uploadFieldPhoto(selectedPhotos[i].file, taskId);
          if (result.success) {
            allPhotoPaths.push(result.path);
          } else {
            throw new Error(`Failed to re-upload photo ${i + 1}`);
          }
        }
      }

      // Call the RPC function
      const { data, error } = await supabase.rpc('submit_field_report', {
        p_task_id: taskId,
        p_lat: location.lat,
        p_lng: location.lng,
        p_accuracy: location.accuracy,
        p_photo_paths: allPhotoPaths,
        p_notes: fieldNotes
      });

      if (error) {
        throw new Error(error.message || 'Failed to submit field report');
      }

      if (!data || !data.success) {
        throw new Error(data?.message || 'Failed to submit field report');
      }

      setSubmitSuccess(true);
      setSelectedPhotos([]);
      setFieldNotes('');
      setFailedUploads([]);
      setRetryFromIndex(null);
    } catch (err) {
      setSubmitError(err.message || 'An error occurred during retry');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if submit button should be enabled
  const canSubmit = location && selectedPhotos.length > 0 && !isSubmitting && !submitSuccess;

  return (
    <div className="space-y-6 p-4">
      {/* SECTION 1 - GPS Capture */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">GPS Location</h3>
        
        {gpsStatus === 'idle' && (
          <button
            onClick={handleCaptureLocation}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
          >
            Capture my location
          </button>
        )}

        {gpsStatus === 'locating' && (
          <div className="flex items-center justify-center py-4">
            <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin mr-3"></div>
            <span className="text-gray-600">Getting your location...</span>
          </div>
        )}

        {gpsStatus === 'success' && location && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-start">
              <div className="w-3 h-3 bg-green-500 rounded-full mt-1.5 mr-3 flex-shrink-0"></div>
              <div className="text-sm text-gray-700">
                <p><span className="font-medium">Latitude:</span> {location.lat.toFixed(6)}</p>
                <p><span className="font-medium">Longitude:</span> {location.lng.toFixed(6)}</p>
                <p><span className="font-medium">Accuracy:</span> ±{location.accuracy.toFixed(1)} meters</p>
              </div>
            </div>
            {/* GPS accuracy warning */}
            {location.accuracy > 100 && (
              <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                <p className="text-yellow-800 text-xs">
                  ⚠️ Low GPS accuracy — consider moving to an open area for better precision
                </p>
              </div>
            )}
          </div>
        )}

        {gpsStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-800 text-sm mb-2">{gpsError}</p>
            {/* iOS Safari specific permission message */}
            {isIOS && isSafari && (gpsError?.toLowerCase().includes('permission') || gpsError?.toLowerCase().includes('denied')) && (
              <p className="text-red-700 text-xs mb-2">
                To enable location access: Go to Settings → Safari → Location → Allow
              </p>
            )}
            <button
              onClick={handleCaptureLocation}
              className="text-sm bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* SECTION 2 - Photo Evidence */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Photo Evidence</h3>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handlePhotoSelect}
          disabled={selectedPhotos.length >= 5 || isSubmitting}
          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {photoError && (
          <p className="text-red-600 text-sm mt-2">{photoError}</p>
        )}

        <p className="text-sm text-gray-600 mt-2">
          {selectedPhotos.length} photo{selectedPhotos.length !== 1 ? 's' : ''} selected
          {selectedPhotos.length >= 5 && ' (maximum reached)'}
        </p>

        {selectedPhotos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
            {selectedPhotos.map((photo, index) => (
              <div key={index} className="relative group">
                <img
                  src={photo.preview}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-24 object-cover rounded-lg border border-gray-200"
                />
                <button
                  onClick={() => handleRemovePhoto(index)}
                  disabled={isSubmitting}
                  className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3 - Field Notes */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Field Observations</h3>
        
        <textarea
          value={fieldNotes}
          onChange={handleNotesChange}
          disabled={isSubmitting}
          placeholder="Describe what you observed on-site..."
          maxLength={300}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        
        <div className="flex justify-between items-center mt-2">
          <span className="text-sm text-gray-500">
            {fieldNotes.length} / 300 characters
          </span>
          {fieldNotes.length >= 300 && (
            <span className="text-sm text-orange-600">Maximum reached</span>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            {uploadProgress.total > 0 ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : 'Submitting report...'}
          </span>
        ) : 'Submit Field Report'}
      </button>

      {/* Success Message */}
      {submitSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">✓ Field report submitted successfully</p>
        </div>
      )}

      {/* Error Message */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{submitError}</p>
          {failedUploads.length > 0 && (
            <div className="mt-2 text-xs text-red-700">
              <p className="font-medium mb-1">Failed uploads:</p>
              <ul className="list-disc list-inside space-y-1">
                {failedUploads.map((failed, idx) => (
                  <li key={idx}>
                    Photo {failed.index + 1}: {failed.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {retryFromIndex !== null ? (
              <button
                onClick={handleRetryFailed}
                disabled={isSubmitting}
                className="text-sm bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
              >
                {isSubmitting ? 'Retrying...' : 'Retry Failed Uploads'}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="text-sm bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
