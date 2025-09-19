import { supabase, withErrorHandling } from '../lib/supabase'
import { Upload } from '../types'

// Helper function to handle service errors consistently
const handleServiceError = (error: any, operation: string, fallbackValue: any = null) => {
  // Handle specific database errors
  if (error?.code === '23502') {
    console.error(`Database constraint violation during ${operation}:`, error)
    throw new Error('Missing required data. Please check all fields are filled correctly.')
  }
  
  if (error?.code === '42501') {
    console.error(`RLS policy violation during ${operation}:`, error)
    throw new Error('Database access denied. Please ensure you are properly authenticated and RLS policies are configured.')
  }
  
  if (error?.message?.includes('Network connection error')) {
    console.warn(`Network error during ${operation}:`, error.message)
    throw new Error('Network connection error. Please check your internet connection and try again.')
  } else if (error?.message?.includes('Failed to fetch')) {
    console.warn(`Fetch error during ${operation}:`, error)
    throw new Error('Connection failed. Please check your internet connection and try again.')
  } else {
    console.error(`Error during ${operation}:`, error)
    if (fallbackValue !== null) {
      return fallbackValue
    }
    throw error
  }
}

// Check if user has proper authentication context
const validateUserAuth = async (operation: string) => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error(`Auth error during ${operation}:`, authError)
      throw new Error('Authentication failed. Please sign in again.')
    }

    if (!user) {
      throw new Error('User not authenticated. Please sign in first.')
    }

    return user
  } catch (error) {
    throw new Error(`Authentication required for ${operation}. Please sign in and try again.`)
  }
}

// Validate upload data
const validateUploadData = (uploadData: any) => {
  const errors: string[] = []
  
  if (!uploadData.title?.trim()) {
    errors.push('Title is required')
  }
  
  if (!uploadData.description?.trim()) {
    errors.push('Description is required')
  }
  
  if (!uploadData.category?.trim()) {
    errors.push('Category is required')
  }
  
  if (!uploadData.location?.trim()) {
    errors.push('Location is required')
  }
  
  if (uploadData.price && (isNaN(uploadData.price) || uploadData.price < 0)) {
    errors.push('Price must be a valid positive number')
  }
  
  if (uploadData.max_duration && (isNaN(uploadData.max_duration) || uploadData.max_duration < 1 || uploadData.max_duration > 365)) {
    errors.push('Duration must be between 1 and 365 days')
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`)
  }
}

export const uploadService = {
  // Get all active uploads with enhanced data fetching
  async getActiveUploads() {
    try {
      // Get uploads first
      const uploadsResult = await withErrorHandling(
        () => supabase
          .from('uploads')
          .select('*')
          .eq('status', 'active')
          .gte('expires_at', new Date().toISOString()) // Only get non-expired uploads
          .order('created_at', { ascending: false }),
        'fetch active uploads',
        []
      )

      if (uploadsResult.error && uploadsResult.error.message.includes('Network connection error')) {
        throw new Error(uploadsResult.error.message)
      }

      const uploadsData = uploadsResult.data || []

      if (!uploadsData || uploadsData.length === 0) {
        return []
      }

      // Get user profiles for the uploads
      const userIds = [...new Set(uploadsData.map(upload => upload.user_id))]
      const profilesResult = await withErrorHandling(
        () => supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', userIds),
        'fetch profiles for uploads',
        []
      )

      if (profilesResult.error) {
        console.warn('Could not fetch profiles:', profilesResult.error)
        // Return uploads without profile data
        return uploadsData.map(upload => ({
          ...upload,
          profiles: null,
          user_name: 'Unknown User'
        }))
      }

      const profilesData = profilesResult.data || []

      // Manually join the data with enhanced profile information
      const uploadsWithProfiles = uploadsData.map(upload => ({
        ...upload,
        profiles: profilesData.find(profile => profile.id === upload.user_id) || null,
        user_name: profilesData.find(profile => profile.id === upload.user_id)?.name || 'Unknown User',
        is_expired: upload.expires_at ? new Date(upload.expires_at) <= new Date() : false,
        days_remaining: upload.expires_at ? Math.max(0, Math.ceil((new Date(upload.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : null
      }))

      return uploadsWithProfiles
    } catch (error) {
      return handleServiceError(error, 'fetch active uploads', [])
    }
  },

  // Get uploads by user with enhanced filtering
  async getUserUploads(userId: string, status?: 'all' | 'active' | 'expired' | 'acquired') {
    try {
      // Validate authentication
      const user = await validateUserAuth('fetch user uploads')
      
      // Verify the userId matches the authenticated user
      if (user.id !== userId) {
        throw new Error('Access denied. You can only access your own uploads.')
      }

      let query = supabase
        .from('uploads')
        .select('*')
        .eq('user_id', userId)

      // Apply status filter
      if (status && status !== 'all') {
        if (status === 'expired') {
          query = query.lt('expires_at', new Date().toISOString())
        } else if (status === 'active') {
          query = query
            .eq('status', 'active')
            .gte('expires_at', new Date().toISOString())
        } else {
          query = query.eq('status', status)
        }
      }

      const result = await withErrorHandling(
        () => query.order('created_at', { ascending: false }),
        'fetch user uploads',
        []
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'fetch user uploads', [])
      }

      const uploads = result.data || []
      
      // Enhance with computed fields
      return uploads.map(upload => ({
        ...upload,
        is_expired: upload.expires_at ? new Date(upload.expires_at) <= new Date() : false,
        days_remaining: upload.expires_at ? Math.max(0, Math.ceil((new Date(upload.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : null
      }))
    } catch (error) {
      return handleServiceError(error, 'fetch user uploads', [])
    }
  },

  // Create new upload with enhanced validation and processing
  async createUpload(uploadData: {
    title: string
    description: string
    category: string
    location: string
    dimensions?: string
    price?: number
    images?: string[]
    expires_at?: string
    max_duration?: number
    contact_settings?: {
      showPhone: boolean
      showEmail: boolean
    }
  }) {
    try {
      // Validate authentication
      const user = await validateUserAuth('create upload')

      // Validate upload data
      validateUploadData(uploadData)

      // Process and validate images
      let processedImages = uploadData.images || []
      if (processedImages.length === 0) {
        throw new Error('At least one image is required for upload')
      }

      // Limit to 5 images maximum
      if (processedImages.length > 5) {
        processedImages = processedImages.slice(0, 5)
      }

      // Calculate expiry date if not provided
      let expiresAt = uploadData.expires_at
      if (!expiresAt && uploadData.max_duration) {
        expiresAt = new Date(Date.now() + uploadData.max_duration * 24 * 60 * 60 * 1000).toISOString()
      } else if (!expiresAt) {
        // Default to 30 days
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }

      // Prepare the upload data with user_id and proper field names
      const upload = {
        user_id: user.id,
        title: uploadData.title.trim(),
        description: uploadData.description.trim(),
        category: uploadData.category,
        location: uploadData.location.trim(),
        dimensions: uploadData.dimensions?.trim() || null,
        price: uploadData.price || null,
        images: processedImages,
        expires_at: expiresAt,
        max_duration: uploadData.max_duration || null,
        status: 'active',
        is_acquired: false,
        contact_settings: uploadData.contact_settings || { showPhone: false, showEmail: true },
        view_count: 0,
        inquiry_count: 0
      }

      console.log('Creating upload with data:', upload)

      const result = await withErrorHandling(
        () => supabase
          .from('uploads')
          .insert([upload])
          .select()
          .single(),
        'create upload'
      )

      if (result.error) {
        console.error('Upload creation error:', result.error)
        handleServiceError(result.error, 'create upload')
      }
      
      console.log('Upload created successfully:', result.data)

      // Create notification for successful upload
      try {
        await supabase
          .from('notifications')
          .insert([{
            user_id: user.id,
            type: 'upload_created',
            title: 'Material shared successfully',
            message: `Your "${upload.title}" is now available for the community`,
            related_id: result.data.id
          }])
      } catch (notifError) {
        console.warn('Failed to create upload notification:', notifError)
      }

      return result.data
    } catch (error) {
      console.error('Error in createUpload:', error)
      handleServiceError(error, 'create upload')
    }
  },

  // Update upload with validation
  async updateUpload(id: string, updates: Partial<Upload>) {
    try {
      // Validate authentication
      const user = await validateUserAuth('update upload')

      // First check if the upload belongs to the user
      const { data: existingUpload, error: fetchError } = await supabase
        .from('uploads')
        .select('user_id, title')
        .eq('id', id)
        .single()

      if (fetchError) {
        handleServiceError(fetchError, 'fetch upload for update')
      }

      if (existingUpload?.user_id !== user.id) {
        throw new Error('Access denied. You can only update your own uploads.')
      }

      // Validate update data if it contains critical fields
      if (updates.title || updates.description || updates.category || updates.location) {
        validateUploadData({ ...existingUpload, ...updates })
      }

      // Process expiry date if max_duration is updated
      if (updates.max_duration) {
        updates.expires_at = new Date(Date.now() + updates.max_duration * 24 * 60 * 60 * 1000).toISOString()
      }

      const result = await withErrorHandling(
        () => supabase
          .from('uploads')
          .update({
            ...updates,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single(),
        'update upload'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'update upload')
      }

      return result.data
    } catch (error) {
      handleServiceError(error, 'update upload')
    }
  },

  // Increment view count
  async incrementViewCount(id: string) {
    try {
      const result = await withErrorHandling(
        () => supabase.rpc('increment_upload_view_count', { upload_id: id }),
        'increment view count'
      )

      if (result.error) {
        console.warn('Failed to increment view count:', result.error)
      }

      return result.data
    } catch (error) {
      console.warn('Error incrementing view count:', error)
      return null
    }
  },

  // Mark upload as acquired
  async markAsAcquired(id: string, acquiredBy?: string) {
    try {
      // Validate authentication
      const user = await validateUserAuth('mark upload as acquired')

      // First check if the upload belongs to the user
      const { data: existingUpload, error: fetchError } = await supabase
        .from('uploads')
        .select('user_id, title')
        .eq('id', id)
        .single()

      if (fetchError) {
        handleServiceError(fetchError, 'fetch upload for acquisition')
      }

      if (existingUpload?.user_id !== user.id) {
        throw new Error('Access denied. You can only modify your own uploads.')
      }

      const result = await withErrorHandling(
        () => supabase
          .from('uploads')
          .update({ 
            is_acquired: true,
            status: 'acquired',
            acquired_by: acquiredBy || null,
            acquired_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single(),
        'mark upload as acquired'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'mark upload as acquired')
      }

      // Create notification for acquisition
      try {
        await supabase
          .from('notifications')
          .insert([{
            user_id: user.id,
            type: 'upload_acquired',
            title: 'Material marked as acquired',
            message: `Your "${existingUpload.title}" has been successfully acquired`,
            related_id: id
          }])
      } catch (notifError) {
        console.warn('Failed to create acquisition notification:', notifError)
      }

      return result.data
    } catch (error) {
      handleServiceError(error, 'mark upload as acquired')
    }
  },

  // Delete upload
  async deleteUpload(id: string) {
    try {
      // Validate authentication
      const user = await validateUserAuth('delete upload')

      // First check if the upload belongs to the user and get image URLs for cleanup
      const { data: existingUpload, error: fetchError } = await supabase
        .from('uploads')
        .select('user_id, images, title')
        .eq('id', id)
        .single()

      if (fetchError) {
        handleServiceError(fetchError, 'fetch upload for deletion')
      }

      if (existingUpload?.user_id !== user.id) {
        throw new Error('Access denied. You can only delete your own uploads.')
      }

      // Delete associated images from storage
      if (existingUpload.images && existingUpload.images.length > 0) {
        for (const imageUrl of existingUpload.images) {
          try {
            await this.deleteImage(imageUrl)
          } catch (imageError) {
            console.warn('Failed to delete image:', imageUrl, imageError)
          }
        }
      }

      const result = await withErrorHandling(
        () => supabase
          .from('uploads')
          .delete()
          .eq('id', id),
        'delete upload'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'delete upload')
      }

      // Create notification for deletion
      try {
        await supabase
          .from('notifications')
          .insert([{
            user_id: user.id,
            type: 'upload_deleted',
            title: 'Material removed',
            message: `Your "${existingUpload.title}" has been removed from the marketplace`,
            related_id: id
          }])
      } catch (notifError) {
        console.warn('Failed to create deletion notification:', notifError)
      }

      return true
    } catch (error) {
      handleServiceError(error, 'delete upload')
      return false
    }
  },

  // Search uploads with advanced filtering
  async searchUploads(query: string, category?: string, filters?: {
    priceRange?: [number, number]
    location?: string
    sortBy?: 'newest' | 'oldest' | 'price_low' | 'price_high' | 'expiring_soon'
  }) {
    try {
      let queryBuilder = supabase
        .from('uploads')
        .select('*')
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString())

      if (query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
      }

      if (category && category !== 'all') {
        queryBuilder = queryBuilder.eq('category', category)
      }

      if (filters?.priceRange) {
        queryBuilder = queryBuilder
          .gte('price', filters.priceRange[0])
          .lte('price', filters.priceRange[1])
      }

      if (filters?.location) {
        queryBuilder = queryBuilder.ilike('location', `%${filters.location}%`)
      }

      // Apply sorting
      switch (filters?.sortBy) {
        case 'oldest':
          queryBuilder = queryBuilder.order('created_at', { ascending: true })
          break
        case 'price_low':
          queryBuilder = queryBuilder.order('price', { ascending: true, nullsFirst: true })
          break
        case 'price_high':
          queryBuilder = queryBuilder.order('price', { ascending: false, nullsLast: true })
          break
        case 'expiring_soon':
          queryBuilder = queryBuilder.order('expires_at', { ascending: true })
          break
        default:
          queryBuilder = queryBuilder.order('created_at', { ascending: false })
      }

      const uploadsResult = await withErrorHandling(
        () => queryBuilder,
        'search uploads',
        []
      )

      if (uploadsResult.error && uploadsResult.error.message.includes('Network connection error')) {
        throw new Error(uploadsResult.error.message)
      }

      const uploadsData = uploadsResult.data || []

      if (!uploadsData || uploadsData.length === 0) {
        return []
      }

      // Get user profiles for the uploads
      const userIds = [...new Set(uploadsData.map(upload => upload.user_id))]
      const profilesResult = await withErrorHandling(
        () => supabase
          .from('profiles')
          .select('id, name, avatar_url')
          .in('id', userIds),
        'fetch profiles for search',
        []
      )

      if (profilesResult.error) {
        console.warn('Could not fetch profiles for search:', profilesResult.error)
        // Return uploads without profile data
        return uploadsData.map(upload => ({
          ...upload,
          profiles: null,
          user_name: 'Unknown User'
        }))
      }

      const profilesData = profilesResult.data || []

      // Manually join the data
      const uploadsWithProfiles = uploadsData.map(upload => ({
        ...upload,
        profiles: profilesData.find(profile => profile.id === upload.user_id) || null,
        user_name: profilesData.find(profile => profile.id === upload.user_id)?.name || 'Unknown User',
        is_expired: upload.expires_at ? new Date(upload.expires_at) <= new Date() : false,
        days_remaining: upload.expires_at ? Math.max(0, Math.ceil((new Date(upload.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : null
      }))

      return uploadsWithProfiles
    } catch (error) {
      return handleServiceError(error, 'search uploads', [])
    }
  },

  // Upload image to Supabase Storage - Enhanced for production
  async uploadImage(file: File): Promise<string> {
    try {
      // Validate authentication
      const user = await validateUserAuth('upload image')

      // Validate file
      if (!file) {
        throw new Error('No file provided for upload')
      }

      // Check file size (5MB limit)
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        throw new Error('File size too large. Maximum size is 5MB.')
      }

      // Check file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.')
      }

      // Generate unique filename with user folder structure
      const fileExt = file.name.split('.').pop()?.toLowerCase()
      const timestamp = Date.now()
      const randomString = Math.random().toString(36).substring(2, 15)
      const fileName = `${timestamp}-${randomString}.${fileExt}`
      const filePath = `uploads/${user.id}/${fileName}`

      console.log('Uploading file:', { fileName, filePath, size: file.size, type: file.type })

      // Upload to the uploads bucket
      const uploadResult = await withErrorHandling(
        () => supabase.storage
          .from('uploads')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          }),
        'upload image'
      )

      if (uploadResult.error) {
        console.error('Storage upload error:', uploadResult.error)
        throw new Error(`Failed to upload image: ${uploadResult.error.message}`)
      }

      console.log('File uploaded successfully to storage:', uploadResult.data)

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(filePath)

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded image')
      }

      console.log('Public URL generated:', urlData.publicUrl)
      return urlData.publicUrl

    } catch (error) {
      console.error('Error in uploadImage:', error)
      handleServiceError(error, 'upload image')
      return ''
    }
  },

  // Upload reference image for requests
  async uploadReferenceImage(file: File): Promise<string> {
    try {
      // Validate authentication
      const user = await validateUserAuth('upload reference image')

      // Validate file
      if (!file) {
        throw new Error('No file provided for upload')
      }

      // Check file size (3MB limit for reference images)
      const maxSize = 3 * 1024 * 1024
      if (file.size > maxSize) {
        throw new Error('File size too large. Maximum size is 3MB for reference images.')
      }

      // Check file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.')
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop()?.toLowerCase()
      const timestamp = Date.now()
      const randomString = Math.random().toString(36).substring(2, 15)
      const fileName = `${timestamp}-${randomString}.${fileExt}`
      const filePath = `reference_images/${user.id}/${fileName}`

      // Upload to the reference_images bucket
      const uploadResult = await withErrorHandling(
        () => supabase.storage
          .from('reference_images')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          }),
        'upload reference image'
      )

      if (uploadResult.error) {
        console.error('Reference image upload error:', uploadResult.error)
        throw new Error(`Failed to upload reference image: ${uploadResult.error.message}`)
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('reference_images')
        .getPublicUrl(filePath)

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get public URL for uploaded reference image')
      }

      return urlData.publicUrl

    } catch (error) {
      console.error('Error in uploadReferenceImage:', error)
      handleServiceError(error, 'upload reference image')
      return ''
    }
  },

  // Delete image from storage
  async deleteImage(imageUrl: string, bucket: 'uploads' | 'reference_images' = 'uploads'): Promise<boolean> {
    try {
      // Validate authentication
      const user = await validateUserAuth('delete image')

      // Extract file path from URL
      const urlParts = imageUrl.split(`/storage/v1/object/public/${bucket}/`)
      if (urlParts.length < 2) {
        throw new Error('Invalid image URL format')
      }

      const filePath = urlParts[1]
      
      // Verify the file belongs to the user (path should contain user ID)
      if (!filePath.includes(`/${user.id}/`)) {
        throw new Error('Access denied. You can only delete your own images.')
      }

      const deleteResult = await withErrorHandling(
        () => supabase.storage
          .from(bucket)
          .remove([filePath]),
        'delete image'
      )

      if (deleteResult.error) {
        console.error('Image deletion error:', deleteResult.error)
        return false
      }

      return true

    } catch (error) {
      console.error('Error in deleteImage:', error)
      return false
    }
  },

  // Get upload statistics for user
  async getUserUploadStats(userId: string) {
    try {
      // Validate authentication
      const user = await validateUserAuth('get upload statistics')
      
      if (user.id !== userId) {
        throw new Error('Access denied. You can only access your own statistics.')
      }

      const { data, error } = await supabase
        .from('uploads')
        .select('status, is_acquired, created_at, view_count, inquiry_count')
        .eq('user_id', userId)

      if (error) {
        handleServiceError(error, 'get upload statistics')
      }

      const uploads = data || []
      const now = new Date()
      
      return {
        total: uploads.length,
        active: uploads.filter(u => u.status === 'active' && !u.is_acquired).length,
        acquired: uploads.filter(u => u.is_acquired).length,
        expired: uploads.filter(u => u.status === 'expired').length,
        total_views: uploads.reduce((sum, u) => sum + (u.view_count || 0), 0),
        total_inquiries: uploads.reduce((sum, u) => sum + (u.inquiry_count || 0), 0),
        this_month: uploads.filter(u => {
          const uploadDate = new Date(u.created_at)
          return uploadDate.getMonth() === now.getMonth() && uploadDate.getFullYear() === now.getFullYear()
        }).length
      }
    } catch (error) {
      return handleServiceError(error, 'get upload statistics', {
        total: 0,
        active: 0,
        acquired: 0,
        expired: 0,
        total_views: 0,
        total_inquiries: 0,
        this_month: 0
      })
    }
  }
}