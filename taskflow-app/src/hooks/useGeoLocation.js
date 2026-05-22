import { useState, useCallback } from 'react';

/**
 * Custom hook for GPS location capture using browser Geolocation API
 * @returns {Object} Location capture state and functions
 * @returns {Object|null} returns.location - GPS coordinates { lat, lng, accuracy } or null
 * @returns {string} returns.status - Current status: 'idle' | 'locating' | 'success' | 'error'
 * @returns {string|null} returns.errorMessage - Error message if status is 'error', null otherwise
 * @returns {Function} returns.capture - Async function to capture current GPS position
 */
export function useGeoLocation() {
  const [location, setLocation] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState(null);

  /**
   * Captures the current GPS position using browser Geolocation API
   * @returns {Promise<Object>} Resolves to location object { lat, lng, accuracy }
   * @throws {Error} If geolocation is not supported or permission is denied
   */
  const capture = useCallback(async () => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      const error = 'Geolocation is not supported by this browser';
      setStatus('error');
      setErrorMessage(error);
      throw new Error(error);
    }

    setStatus('locating');
    setErrorMessage(null);

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        // Success callback
        (position) => {
          const locationData = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          
          setLocation(locationData);
          setStatus('success');
          setErrorMessage(null);
          resolve(locationData);
        },
        // Error callback
        (error) => {
          let message;
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'User denied the request for geolocation';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'Location information is unavailable';
              break;
            case error.TIMEOUT:
              message = 'The request to get user location timed out';
              break;
            default:
              message = 'An unknown error occurred while retrieving location';
              break;
          }
          
          setStatus('error');
          setErrorMessage(message);
          reject(new Error(message));
        },
        // Options
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        }
      );
    });
  }, []);

  return {
    location,
    status,
    errorMessage,
    capture
  };
}
