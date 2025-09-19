export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  location: string
  joinedDate: string
}

export interface Upload {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  title: string
  description: string
  category: string
  location: string
  dimensions?: string
  price?: number
  images: string[]
  createdAt: string
  expiresAt?: string
  status: 'active' | 'lapsed' | 'acquired'
  isAcquired: boolean
  maxDuration?: number
}

export interface Request {
  id: string
  userId: string
  userName: string
  userAvatar?: string
  title: string
  description: string
  category: string
  location: string
  referenceImage?: string
  notes?: string
  createdAt: string
  expiresAt: string
  status: 'active' | 'inactive' | 'completed'
  responses: RequestResponse[]
}

export interface RequestResponse {
  id: string
  requestId: string
  userId: string
  userName: string
  message: string
  createdAt: string
}

export interface SavedItem {
  id: string
  userId: string
  uploadId: string
  savedAt: string
}

export interface Notification {
  id: string
  userId: string
  type: 'saved_item_removed' | 'request_response' | 'upload_acquired' | 'request_fulfilled'
  title: string
  message: string
  createdAt: string
  isRead: boolean
  relatedId?: string
}

export type Category = 
  | 'Electronics'
  | 'Furniture' 
  | 'Clothing'
  | 'Books'
  | 'Materials'
  | 'Tools'
  | 'Other'