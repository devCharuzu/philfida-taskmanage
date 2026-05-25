import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Lightbox from './Lightbox';

/**
 * Modal component for displaying field report data (GPS, photos, notes)
 * Shows when a task has field_location, field_photos, or field_notes
 * Designed with PhilFIDA branding and W3C accessibility guidelines
 */
export default function FieldReportViewer({ task, isOpen, onClose }) {
  const [lightboxFile, setLightboxFile] = useState(null);
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Check if task has field report data
  const hasFieldReport = task.field_location || task.field_photos || task.field_notes;
  
  // Parse field location JSON
  const location = task.field_location 
    ? (typeof task.field_location === 'string' ? JSON.parse(task.field_location) : task.field_location)
    : null;
  
  // Get photo paths
  const photos = task.field_photos || [];
  
  // Get field notes
  const notes = task.field_notes || '';
  
  // Format submission time
  const submittedAt = task.field_submitted_at 
    ? new Date(task.field_submitted_at).toLocaleString()
    : null;

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

    // Store previously focused element
    previousActiveElement.current = document.activeElement;

    // Focus modal when opened
    if (modalRef.current) {
      modalRef.current.focus();
    }

    // Restore focus when closed
    return () => {
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  // Handle photo click for lightbox
  const handlePhotoClick = async (path) => {
    try {
      const { data, error } = await supabase.storage
        .from('taskflow-files')
        .createSignedUrl(path, 3600); // 1 hour expiry
      
      if (error) throw error;
      
      const fileName = path.split('/').pop();
      setLightboxFile({ url: data.signedUrl, name: fileName });
    } catch (err) {
      console.error('Failed to get signed URL:', err);
    }
  };

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
        aria-labelledby="field-report-title"
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
                  <h2 id="field-report-title" className="text-lg font-bold text-white">
                    Field Report
                  </h2>
                  {submittedAt && (
                    <p className="text-green-100 text-xs mt-0.5">
                      Submitted: {submittedAt}
                    </p>
                  )}
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
            {!hasFieldReport ? (
              <div className="text-center py-8">
                <i className="bi bi-geo-alt text-4xl text-slate-300 mb-3" />
                <p className="text-slate-500">No field report data available for this task.</p>
              </div>
            ) : (
              <>
                {/* GPS Location */}
                {location && (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-green-900 uppercase tracking-wider mb-4">
                      <i className="bi bi-geo-alt text-green-600" />
                      GPS Location
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <span className="block text-xs text-slate-500 font-medium mb-1">Latitude</span>
                        <p className="font-mono font-semibold text-slate-800 text-sm">
                          {location.lat?.toFixed(6)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <span className="block text-xs text-slate-500 font-medium mb-1">Longitude</span>
                        <p className="font-mono font-semibold text-slate-800 text-sm">
                          {location.lng?.toFixed(6)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-green-100">
                        <span className="block text-xs text-slate-500 font-medium mb-1">Accuracy</span>
                        <p className="font-mono font-semibold text-slate-800 text-sm">
                          ±{location.accuracy?.toFixed(1)}m
                        </p>
                      </div>
                    </div>
                    {location.captured_at && (
                      <p className="text-xs text-slate-500 mt-3">
                        <span className="font-medium">Captured:</span> {new Date(location.captured_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Photo Evidence */}
                {photos.length > 0 && (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-green-900 uppercase tracking-wider mb-4">
                      <i className="bi bi-images text-green-600" />
                      Photo Evidence ({photos.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {photos.map((path, index) => (
                        <button
                          key={index}
                          onClick={() => handlePhotoClick(path)}
                          className="relative aspect-square bg-white rounded-lg border border-green-100 overflow-hidden hover:ring-2 hover:ring-green-500 hover:ring-offset-2 transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 group"
                          aria-label={`View photo ${index + 1}`}
                        >
                          <div className="absolute inset-0 flex items-center justify-center text-slate-300 group-hover:text-green-500 transition-colors">
                            <i className="bi bi-image text-3xl" />
                          </div>
                          <div className="absolute bottom-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                            {index + 1}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Field Notes */}
                {notes && (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-green-900 uppercase tracking-wider mb-4">
                      <i className="bi bi-pencil-square text-green-600" />
                      Field Observations
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-white rounded-lg p-4 border border-green-100">
                      {notes}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4">
            <button
              onClick={onClose}
              className="w-full py-3 px-6 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-lg shadow-green-900/20"
            >
              Close Report
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox for photo viewing */}
      {lightboxFile && (
        <Lightbox file={lightboxFile} onClose={() => setLightboxFile(null)} />
      )}
    </>
  );
}
