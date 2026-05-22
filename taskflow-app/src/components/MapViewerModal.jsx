import { useRef, useEffect } from 'react';

/**
 * Modal component for displaying an embedded map
 * Shows GPS location on Google Maps without opening a new tab
 * Designed with PhilFIDA branding and W3C accessibility guidelines
 */
export default function MapViewerModal({ isOpen, onClose, lat, lng, locationName }) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);

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

  // Handle backdrop click to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Generate Google Maps embed URL
  const getMapsEmbedUrl = () => {
    if (!lat || !lng) return '';
    // Using Google Maps Embed API with place mode
    return `https://www.google.com/maps?q=${lat},${lng}&output=embed`;
  };

  // Generate Google Maps URL for opening in new tab (as fallback)
  const getMapsUrl = () => {
    if (!lat || !lng) return '';
    return `https://www.google.com/maps?q=${lat},${lng}`;
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
        aria-labelledby="map-viewer-title"
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        {/* Modal Content */}
        <div
          ref={modalRef}
          tabIndex={-1}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gradient-to-r from-green-700 to-green-800 px-6 py-5 border-b border-green-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <i className="bi bi-map-fill text-white text-lg" />
                </div>
                <div>
                  <h2 id="map-viewer-title" className="text-lg font-bold text-white">
                    Location Map
                  </h2>
                  {locationName && (
                    <p className="text-green-100 text-xs mt-0.5 truncate max-w-md">
                      {locationName}
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
          <div className="p-6">
            {/* Coordinates Display */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs text-slate-500 font-medium mb-1">Latitude</span>
                  <p className="font-mono font-semibold text-slate-800 text-sm">
                    {lat?.toFixed(6) || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="block text-xs text-slate-500 font-medium mb-1">Longitude</span>
                  <p className="font-mono font-semibold text-slate-800 text-sm">
                    {lng?.toFixed(6) || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Map Embed */}
            <div className="relative w-full h-96 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
              {lat && lng ? (
                <iframe
                  src={getMapsEmbedUrl()}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Google Maps Location"
                  className="absolute inset-0"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-slate-500">Location coordinates not available</p>
                </div>
              )}
            </div>

            {/* Open in Google Maps Button */}
            {lat && lng && (
              <div className="mt-4">
                <a
                  href={getMapsUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  <i className="bi bi-box-arrow-up-right" />
                  Open in Google Maps
                </a>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4">
            <button
              onClick={onClose}
              className="w-full py-3 px-6 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-lg shadow-green-900/20"
            >
              Close Map
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
