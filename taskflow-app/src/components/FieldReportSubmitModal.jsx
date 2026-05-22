import { useState, useRef, useEffect } from 'react';
import { useGeoLocation } from '../hooks/useGeoLocation';
import { uploadFieldPhoto } from '../lib/uploadFieldPhoto';
import { supabase } from '../lib/supabase';
import MapViewerModal from './MapViewerModal';

/**
 * Modal component for submitting field report data (GPS, photos, notes)
 * Used when creating a task or submitting a field report for an existing task
 * Designed with PhilFIDA branding and W3C accessibility guidelines
 */
export default function FieldReportSubmitModal({ isOpen, onClose, taskId, onReportSubmitted }) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  // GPS capture state
  const { location, status: gpsStatus, errorMessage: gpsError, capture: captureLocation } = useGeoLocation();
  
  // Location name state (reverse geocoding)
  const [locationName, setLocationName] = useState('');
  const [isFetchingLocationName, setIsFetchingLocationName] = useState(false);
  
  // Map modal state
  const [showMapModal, setShowMapModal] = useState(false);
  
  // Accuracy threshold (in meters) - set to 5m as requested
  const ACCURACY_THRESHOLD = 5;

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

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus management for accessibility
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement;

    if (modalRef.current) {
      modalRef.current.focus();
    }

    return () => {
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

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

  // Fetch location name using reverse geocoding (OpenStreetMap Nominatim API)
  const fetchLocationName = async (lat, lng) => {
    setIsFetchingLocationName(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }
      );
      const data = await response.json();
      if (data.display_name) {
        setLocationName(data.display_name);
      }
    } catch (err) {
      console.error('Failed to fetch location name:', err);
    } finally {
      setIsFetchingLocationName(false);
    }
  };

  // Fetch location name when GPS capture succeeds
  useEffect(() => {
    if (gpsStatus === 'success' && location) {
      fetchLocationName(location.lat, location.lng);
    }
  }, [gpsStatus, location]);

  // Handle recapture location
  const handleRecaptureLocation = async () => {
    setLocationName('');
    await handleCaptureLocation();
  };

  // Handle show in maps
  const handleShowInMaps = () => {
    if (location) {
      setShowMapModal(true);
    }
  };

  // Handle photo selection
  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    
    if (selectedPhotos.length + files.length > 5) {
      setPhotoError('Maximum 5 photos allowed');
      return;
    }

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
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove photo
  const handleRemovePhoto = (index) => {
    setSelectedPhotos(prev => {
      const newPhotos = [...prev];
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
      setSubmitError('Please capture GPS location and select at least one photo');
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

      // Notify parent component
      if (onReportSubmitted) {
        onReportSubmitted({
          location: { lat: location.lat, lng: location.lng, accuracy: location.accuracy },
          photos: photoPaths,
          notes: fieldNotes
        });
      }

      // Close modal after success
      setTimeout(() => {
        onClose();
      }, 1500);
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

      if (newFailedIndices.length > 0) {
        const failedMsg = `Retry failed for ${newFailedIndices.length} photo${newFailedIndices.length !== 1 ? 's' : ''}`;
        setSubmitError(failedMsg);
        setIsSubmitting(false);
        return;
      }

      const allPhotoPaths = [];
      for (let i = 0; i < selectedPhotos.length; i++) {
        const retriedPath = photoPaths.find(p => p.originalIndex === i);
        if (retriedPath) {
          allPhotoPaths.push(retriedPath.path);
        } else {
          const result = await uploadFieldPhoto(selectedPhotos[i].file, taskId);
          if (result.success) {
            allPhotoPaths.push(result.path);
          } else {
            throw new Error(`Failed to re-upload photo ${i + 1}`);
          }
        }
      }

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

      if (onReportSubmitted) {
        onReportSubmitted({
          location: { lat: location.lat, lng: location.lng, accuracy: location.accuracy },
          photos: allPhotoPaths,
          notes: fieldNotes
        });
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setSubmitError(err.message || 'An error occurred during retry');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if accuracy is acceptable
  const isAccuracyAcceptable = location && location.accuracy <= ACCURACY_THRESHOLD;
  const isAccuracyPoor = location && location.accuracy > ACCURACY_THRESHOLD;
  
  // Check if submit button should be enabled
  const canSubmit = location && selectedPhotos.length > 0 && !isSubmitting && !submitSuccess;

  // Handle backdrop click to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Modal Backdrop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-report-submit-title"
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        {/* Modal Content */}
        <div
          ref={modalRef}
          tabIndex={-1}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gradient-to-r from-green-700 to-green-800 px-6 py-5 border-b border-green-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <i className="bi bi-geo-alt-fill text-white text-lg" />
                </div>
                <div>
                  <h2 id="field-report-submit-title" className="text-lg font-bold text-white">
                    Submit Field Report
                  </h2>
                  <p className="text-green-100 text-xs mt-0.5">
                    {taskId ? `Task ID: ${taskId}` : 'Attach to new task'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-green-700"
                aria-label="Close modal"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* GPS Location */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-green-900 uppercase tracking-wider mb-4">
                <i className="bi bi-geo-alt text-green-600" />
                GPS Location
              </h3>
              
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
                <div className="bg-white rounded-lg p-4 border border-green-100">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div>
                      <span className="block text-xs text-slate-500 font-medium mb-1">Latitude</span>
                      <p className="font-mono font-semibold text-slate-800 text-sm">
                        {location.lat.toFixed(6)}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500 font-medium mb-1">Longitude</span>
                      <p className="font-mono font-semibold text-slate-800 text-sm">
                        {location.lng.toFixed(6)}
                      </p>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-500 font-medium mb-1">Accuracy</span>
                      <p className="font-mono font-semibold text-slate-800 text-sm">
                        ±{location.accuracy.toFixed(1)}m
                      </p>
                    </div>
                  </div>
                  
                  {/* Location Name */}
                  {locationName && (
                    <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <i className="bi bi-geo-alt-fill text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <span className="block text-xs text-green-800 font-semibold mb-1">Location</span>
                          <p className="text-sm text-green-900 leading-snug">
                            {isFetchingLocationName ? 'Loading location name...' : locationName}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleRecaptureLocation}
                      className="flex-1 py-2 px-3 bg-green-100 hover:bg-green-200 text-green-800 font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      <i className="bi bi-arrow-counterclockwise" />
                      Recapture
                    </button>
                    <button
                      onClick={handleShowInMaps}
                      className="flex-1 py-2 px-3 bg-blue-100 hover:bg-blue-200 text-blue-800 font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      <i className="bi bi-map" />
                      Show in Maps
                    </button>
                  </div>
                  
                  {/* Accuracy Warning */}
                  {isAccuracyPoor && (
                    <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <i className="bi bi-info-circle-fill text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-yellow-800 text-xs font-semibold mb-1">
                            GPS accuracy warning
                          </p>
                          <p className="text-yellow-700 text-xs">
                            Current accuracy: ±{location.accuracy.toFixed(1)}m (recommended: ≤{ACCURACY_THRESHOLD}m). Location may be off by up to {location.accuracy.toFixed(0)}m. You can still submit, but consider recapturing in an open area for better accuracy.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {gpsStatus === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm mb-2">{gpsError}</p>
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

            {/* Photo Evidence */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-green-900 uppercase tracking-wider mb-4">
                <i className="bi bi-images text-green-600" />
                Photo Evidence
              </h3>
              
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

            {/* Field Notes */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-green-900 uppercase tracking-wider mb-4">
                <i className="bi bi-pencil-square text-green-600" />
                Field Observations
              </h3>
              
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

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex-1 py-3 px-6 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-lg shadow-green-900/20"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    {uploadProgress.total > 0 ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` : 'Submitting...'}
                  </span>
                ) : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Map Viewer Modal */}
      {showMapModal && location && (
        <MapViewerModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          lat={location.lat}
          lng={location.lng}
          locationName={locationName}
        />
      )}
    </>
  );
}
