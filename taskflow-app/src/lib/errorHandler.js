// Standardized error handling utility for PhilFIDA TaskFlow

export class AppError extends Error {
  constructor(message, type = 'general', code = null) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.code = code
  }
}

export const ERROR_TYPES = {
  NETWORK: 'network',
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  DATABASE: 'database',
  STORAGE: 'storage',
  GENERAL: 'general'
}

export const ERROR_MESSAGES = {
  NETWORK: 'Network connection error. Please check your internet connection and try again.',
  DATABASE: 'Database error. Please try again later.',
  AUTHENTICATION: 'Authentication failed. Please log in again.',
  AUTHORIZATION: 'You do not have permission to perform this action.',
  VALIDATION: 'Please check your input and try again.',
  STORAGE: 'File storage error. Please try again.',
  GENERAL: 'An error occurred. Please try again.'
}

/**
 * Standard error handler that converts different error types to user-friendly messages
 */
export function handleError(error, fallbackMessage = ERROR_MESSAGES.GENERAL) {
  console.error('Error handled:', error)
  
  // If it's already an AppError, return its message
  if (error instanceof AppError) {
    return error.message
  }
  
  // Handle Supabase errors
  if (error?.code) {
    switch (error.code) {
      case 'PGRST301':
        return 'Your session has expired. Please log in again.'
      case 'PGRST116':
        return 'The requested data was not found.'
      case '23505':
        return 'This record already exists.'
      case '23503':
        return 'Referenced record does not exist.'
      case '23514':
        return 'Invalid data provided.'
      case '42501':
        return 'You do not have permission to perform this action.'
      case '28P01':
        return 'Database connection error. Please try again later.'
      default:
        return ERROR_MESSAGES.DATABASE
    }
  }
  
  // Handle network errors
  if (error?.name === 'TypeError' && error?.message?.includes('fetch')) {
    return ERROR_MESSAGES.NETWORK
  }
  
  // Handle storage errors
  if (error?.message?.includes('storage') || error?.message?.includes('upload')) {
    return ERROR_MESSAGES.STORAGE
  }
  
  // Handle validation errors
  if (error?.name === 'ValidationError') {
    return ERROR_MESSAGES.VALIDATION
  }
  
  // Return the error message if it's user-friendly
  if (typeof error?.message === 'string' && 
      error.message.length < 200 && 
      !error.message.includes('Internal Server Error') &&
      !error.message.includes('TypeError') &&
      !error.message.includes('ReferenceError')) {
    return error.message
  }
  
  // Return fallback message
  return fallbackMessage
}

/**
 * Async error wrapper for consistent error handling
 */
export async function withErrorHandling(asyncFn, fallbackMessage = ERROR_MESSAGES.GENERAL) {
  try {
    return await asyncFn()
  } catch (error) {
    throw new AppError(handleError(error, fallbackMessage))
  }
}

/**
 * Form validation helper
 */
export function validateForm(fields, rules) {
  const errors = {}
  
  for (const [field, rule] of Object.entries(rules)) {
    const value = fields[field]
    
    // Required validation
    if (rule.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
      errors[field] = `${rule.label || field} is required`
      continue
    }
    
    // Email validation
    if (rule.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors[field] = `${rule.label || field} must be a valid email`
    }
    
    // Length validation
    if (rule.minLength && value && value.length < rule.minLength) {
      errors[field] = `${rule.label || field} must be at least ${rule.minLength} characters`
    }
    
    if (rule.maxLength && value && value.length > rule.maxLength) {
      errors[field] = `${rule.label || field} must not exceed ${rule.maxLength} characters`
    }
    
    // Pattern validation
    if (rule.pattern && value && !rule.pattern.test(value)) {
      errors[field] = rule.message || `${rule.label || field} format is invalid`
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Error boundary compatible error creator
 */
export function createBoundaryError(error, errorInfo) {
  console.error('Boundary Error:', error, errorInfo)
  return new AppError(
    'A critical error occurred. The page has been reset to prevent further issues.',
    'critical',
    'BOUNDARY_ERROR'
  )
}
