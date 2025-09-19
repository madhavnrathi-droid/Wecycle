import { supabase, isSupabaseConfigured, withErrorHandling } from '../lib/supabase'

// Helper function to handle service errors consistently
const handleServiceError = (error: any, operation: string, fallbackValue: any = null) => {
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

export const notificationService = {
  // Get user notifications
  async getUserNotifications(userId: string) {
    if (!isSupabaseConfigured) {
      return []
    }

    try {
      const result = await withErrorHandling(
        () => supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        'fetch notifications',
        []
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'fetch notifications', [])
      }
      
      return result.data || []
    } catch (error) {
      return handleServiceError(error, 'fetch notifications', [])
    }
  },

  // Mark notification as read
  async markAsRead(id: string) {
    if (!isSupabaseConfigured) {
      return
    }

    try {
      const result = await withErrorHandling(
        () => supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', id),
        'mark notification as read'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'mark notification as read')
      }
    } catch (error) {
      handleServiceError(error, 'mark notification as read')
    }
  },

  // Mark all notifications as read
  async markAllAsRead(userId: string) {
    if (!isSupabaseConfigured) {
      return
    }

    try {
      const result = await withErrorHandling(
        () => supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false),
        'mark all notifications as read'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'mark all notifications as read')
      }
    } catch (error) {
      handleServiceError(error, 'mark all notifications as read')
    }
  },

  // Delete notification
  async deleteNotification(id: string) {
    if (!isSupabaseConfigured) {
      return
    }

    try {
      const result = await withErrorHandling(
        () => supabase
          .from('notifications')
          .delete()
          .eq('id', id),
        'delete notification'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'delete notification')
      }
    } catch (error) {
      handleServiceError(error, 'delete notification')
    }
  },

  // Subscribe to real-time notifications
  subscribeToNotifications(userId: string, callback: (notification: any) => void) {
    if (!isSupabaseConfigured) {
      return { unsubscribe: () => {} }
    }

    try {
      const subscription = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`
          },
          callback
        )
        .subscribe()

      return subscription
    } catch (error) {
      console.error('Error subscribing to notifications:', error)
      return { unsubscribe: () => {} }
    }
  }
}

export const savedItemsService = {
  // Get user's saved items
  async getSavedItems(userId: string) {
    if (!isSupabaseConfigured) {
      return []
    }

    try {
      // Get saved items first
      const savedItemsResult = await withErrorHandling(
        () => supabase
          .from('saved_items')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        'fetch saved items',
        []
      )

      if (savedItemsResult.error && savedItemsResult.error.message.includes('Network connection error')) {
        throw new Error(savedItemsResult.error.message)
      }

      const savedItemsData = savedItemsResult.data || []

      if (!savedItemsData || savedItemsData.length === 0) {
        return []
      }

      // Get the uploads for saved items
      const uploadIds = savedItemsData.map(item => item.upload_id)
      const uploadsResult = await withErrorHandling(
        () => supabase
          .from('uploads')
          .select('*')
          .in('id', uploadIds),
        'fetch uploads for saved items',
        []
      )

      if (uploadsResult.error) {
        console.warn('Could not fetch uploads for saved items:', uploadsResult.error)
        return savedItemsData.map(item => ({ ...item, uploads: null }))
      }

      const uploadsData = uploadsResult.data || []

      // Get user profiles for the uploads
      const userIds = [...new Set(uploadsData.map(upload => upload.user_id))]
      let profilesData = []
      if (userIds.length > 0) {
        const profilesResult = await withErrorHandling(
          () => supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', userIds),
          'fetch profiles for saved items',
          []
        )
        
        if (profilesResult.error) {
          console.warn('Could not fetch profiles for saved items:', profilesResult.error)
        } else {
          profilesData = profilesResult.data || []
        }
      }

      // Manually join the data
      const savedItemsWithUploads = savedItemsData.map(savedItem => {
        const upload = uploadsData.find(upload => upload.id === savedItem.upload_id)
        if (!upload) {
          return { ...savedItem, uploads: null }
        }

        const profile = profilesData.find(profile => profile.id === upload.user_id)
        return {
          ...savedItem,
          uploads: {
            ...upload,
            profiles: profile || null
          }
        }
      })

      return savedItemsWithUploads
    } catch (error) {
      return handleServiceError(error, 'fetch saved items', [])
    }
  },

  // Save an item
  async saveItem(uploadId: string) {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase not configured')
    }

    try {
      const result = await withErrorHandling(
        () => supabase
          .from('saved_items')
          .insert([{ upload_id: uploadId }])
          .select()
          .single(),
        'save item'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'save item')
      }
      return result.data
    } catch (error) {
      handleServiceError(error, 'save item')
    }
  },

  // Unsave an item
  async unsaveItem(uploadId: string, userId: string) {
    if (!isSupabaseConfigured) {
      return
    }

    try {
      const result = await withErrorHandling(
        () => supabase
          .from('saved_items')
          .delete()
          .eq('upload_id', uploadId)
          .eq('user_id', userId),
        'unsave item'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'unsave item')
      }
    } catch (error) {
      handleServiceError(error, 'unsave item')
    }
  },

  // Check if item is saved
  async isItemSaved(uploadId: string, userId: string) {
    if (!isSupabaseConfigured) {
      return false
    }

    try {
      const result = await withErrorHandling(
        () => supabase
          .from('saved_items')
          .select('id')
          .eq('upload_id', uploadId)
          .eq('user_id', userId)
          .single(),
        'check if item is saved',
        null
      )

      if (result.error && result.error.code !== 'PGRST116' && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'check if item is saved', false)
      }
      return !!result.data
    } catch (error) {
      return handleServiceError(error, 'check if item is saved', false)
    }
  }
}