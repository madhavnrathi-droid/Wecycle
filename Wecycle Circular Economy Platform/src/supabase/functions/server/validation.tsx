// Validation helpers for server endpoints
export const validateUploadData = (data: any): string[] => {
  const errors: string[] = [];
  
  if (!data.title?.trim()) errors.push('Title is required');
  if (!data.description?.trim()) errors.push('Description is required');
  if (!data.category?.trim()) errors.push('Category is required');
  if (!data.location?.trim()) errors.push('Location is required');
  if (data.price && (isNaN(data.price) || data.price < 0)) errors.push('Price must be a valid positive number');
  if (!data.images || !Array.isArray(data.images) || data.images.length === 0) errors.push('At least one image is required');
  
  return errors;
};

export const validateRequestData = (data: any): string[] => {
  const errors: string[] = [];
  
  if (!data.title?.trim()) errors.push('Title is required');
  if (!data.description?.trim()) errors.push('Description is required');
  if (!data.category?.trim()) errors.push('Category is required');
  if (!data.location?.trim()) errors.push('Location is required');
  if (!data.expires_at) errors.push('Expiry date is required');
  if (data.expires_at && new Date(data.expires_at) <= new Date()) errors.push('Expiry date must be in the future');
  
  return errors;
};

export const validateUserRegistration = (data: any): string[] => {
  const errors: string[] = [];
  
  if (!data.email) errors.push('Email is required');
  if (!data.password) errors.push('Password is required');
  if (data.password && data.password.length < 6) errors.push('Password must be at least 6 characters');
  
  return errors;
};

export const validateFileUpload = (file: File, maxSize: number, allowedTypes: string[]): string[] => {
  const errors: string[] = [];
  
  if (!file) {
    errors.push('No file provided');
    return errors;
  }
  
  if (!allowedTypes.includes(file.type)) {
    errors.push(`Invalid file type. Only ${allowedTypes.join(', ')} are allowed.`);
  }
  
  if (file.size > maxSize) {
    const maxSizeMB = maxSize / (1024 * 1024);
    errors.push(`File too large. Maximum size is ${maxSizeMB}MB.`);
  }
  
  return errors;
};