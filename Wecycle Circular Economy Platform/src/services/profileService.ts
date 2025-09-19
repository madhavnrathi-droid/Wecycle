import { supabase, withErrorHandling } from '../lib/supabase'

// Helper function to handle service errors consistently
const handleServiceError = (error: any, operation: string, fallbackValue: any = null) => {
  // Handle RLS policy violations specifically
  if (error?.code === '42501') {
    console.warn(`RLS policy violation during ${operation}:`, error.message)
    throw new Error('Database access denied. Please ensure RLS policies are set up correctly. See SUPABASE_SETUP.md for guidance.')
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
const validateUserAuth = async (userId: string, operation: string) => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error(`Auth error during ${operation}:`, authError)
      throw new Error('Authentication failed. Please sign in again.')
    }

    if (!user) {
      throw new Error('User not authenticated. Please sign in first.')
    }

    // Verify the userId matches the authenticated user
    if (user.id !== userId) {
      throw new Error('Access denied. You can only access your own data.')
    }

    return user
  } catch (error) {
    throw new Error(`Authentication required for ${operation}. Please sign in and try again.`)
  }
}

export const profileService = {
  // Get user profile - now with graceful RLS handling
  async getProfile(userId: string) {
    try {
      // Validate authentication first
      const user = await validateUserAuth(userId, 'profile access')

      const result = await withErrorHandling(
        () => supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        'get profile'
      )

      if (result.error) {
        // If profile doesn't exist (PGRST116), try to create one
        if (result.error.code === 'PGRST116') {
          console.log('Profile not found, attempting to create default profile for user:', userId)
          
          try {
            // Try to create a basic profile
            const defaultProfile = {
              id: userId,
              name: user?.user_metadata?.name || user?.email?.split('@')[0] || 'New User',
              email: user?.email || '',
              location: user?.user_metadata?.location || 'Not specified',
              bio: null,
              phone: null,
              avatar_url: null
            }

            const createResult = await withErrorHandling(
              () => supabase
                .from('profiles')
                .insert([defaultProfile])
                .select()
                .single(),
              'create default profile'
            )

            if (createResult.error) {
              // If RLS prevents creation, return a temporary profile object
              if (createResult.error.code === '42501') {
                console.warn('RLS prevents profile creation. Using temporary profile.')
                return {
                  ...defaultProfile,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  _isTemporary: true // Mark as temporary so UI can show appropriate message
                }
              }
              handleServiceError(createResult.error, 'create default profile')
            }

            return createResult.data
          } catch (createError: any) {
            // If we can't create a profile due to RLS, return a read-only profile
            console.warn('Failed to create profile in database, using temporary profile:', createError.message)
            return {
              id: userId,
              name: user?.user_metadata?.name || user?.email?.split('@')[0] || 'New User',
              email: user?.email || '',
              location: user?.user_metadata?.location || 'Not specified',
              bio: null,
              phone: null,
              avatar_url: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              _isTemporary: true,
              _rlsError: true
            }
          }
        } else {
          // Handle other errors including RLS
          handleServiceError(result.error, 'get profile')
        }
      }

      return result.data
    } catch (error) {
      // If it's an RLS error, provide helpful guidance
      if (error instanceof Error && error.message.includes('Database access denied')) {
        throw new Error('Database access denied. Please check that Row Level Security policies are properly configured in your Supabase dashboard. See SUPABASE_SETUP.md for setup instructions.')
      }
      handleServiceError(error, 'get profile')
    }
  },

  // Update user profile with RLS-aware error handling
  async updateProfile(userId: string, updates: {
    name?: string
    location?: string
    bio?: string
    phone?: string
    avatar_url?: string
  }) {
    try {
      // Validate authentication first
      await validateUserAuth(userId, 'profile update')

      // Add updated_at timestamp
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      }

      const result = await withErrorHandling(
        () => supabase
          .from('profiles')
          .update(updateData)
          .eq('id', userId)
          .select()
          .single(),
        'update profile'
      )

      if (result.error) {
        // If profile doesn't exist, try to create it first
        if (result.error.code === 'PGRST116') {
          console.log('Profile not found during update, creating it first')
          await this.getProfile(userId) // This will create the profile or return temporary one
          
          // Now try the update again
          const retryResult = await withErrorHandling(
            () => supabase
              .from('profiles')
              .update(updateData)
              .eq('id', userId)
              .select()
              .single(),
            'update profile (retry)'
          )

          if (retryResult.error) {
            handleServiceError(retryResult.error, 'update profile (retry)')
          }
          return retryResult.data
        } else {
          handleServiceError(result.error, 'update profile')
        }
      }

      return result.data
    } catch (error) {
      // Provide helpful RLS guidance
      if (error instanceof Error && error.message.includes('Database access denied')) {
        throw new Error('Unable to update profile. Please ensure Row Level Security policies are configured correctly. See SUPABASE_SETUP.md for guidance.')
      }
      handleServiceError(error, 'update profile')
    }
  },

  // Get user stats with graceful error handling
  async getUserStats(userId: string) {
    try {
      // Validate authentication first
      await validateUserAuth(userId, 'stats access')

      // Get upload counts
      const uploadsResult = await withErrorHandling(
        () => supabase
          .from('uploads')
          .select('status')
          .eq('user_id', userId),
        'fetch uploads for stats',
        []
      )

      // Get request counts
      const requestsResult = await withErrorHandling(
        () => supabase
          .from('requests')
          .select('status')
          .eq('user_id', userId),
        'fetch requests for stats',
        []
      )

      const uploads = uploadsResult.data || []
      const requests = requestsResult.data || []

      const totalUploads = uploads.length || 0
      const totalRequests = requests.length || 0
      const itemsShared = uploads.filter(u => u.status === 'acquired').length || 0
      const requestsFulfilled = requests.filter(r => r.status === 'completed').length || 0

      return {
        totalUploads,
        totalRequests,
        itemsShared,
        requestsFulfilled
      }
    } catch (error) {
      console.error('Error getting user stats:', error)
      // Return zeros if there's an error - don't fail the entire profile load
      return {
        totalUploads: 0,
        totalRequests: 0,
        itemsShared: 0,
        requestsFulfilled: 0
      }
    }
  },

  // Upload avatar with proper auth validation
  async uploadAvatar(file: File, userId: string): Promise<string> {
    try {
      // Validate authentication first
      await validateUserAuth(userId, 'avatar upload')

      const fileExt = file.name.split('.').pop()
      const fileName = `avatar-${userId}.${fileExt}`
      const filePath = `avatars/${fileName}`

      const uploadResult = await withErrorHandling(
        () => supabase.storage
          .from('images')
          .upload(filePath, file, { upsert: true }),
        'upload avatar'
      )

      if (uploadResult.error) {
        handleServiceError(uploadResult.error, 'upload avatar')
      }

      const { data } = supabase.storage
        .from('images')
        .getPublicUrl(filePath)

      // Try to update profile with new avatar URL
      try {
        await this.updateProfile(userId, { avatar_url: data.publicUrl })
      } catch (updateError) {
        console.warn('Failed to update profile with avatar URL:', updateError)
        // Return the URL anyway - the upload succeeded
      }

      return data.publicUrl
    } catch (error) {
      handleServiceError(error, 'upload avatar')
      return ''
    }
  },

  // Check if RLS policies are properly configured (utility function)
  async checkRLSConfiguration() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return { configured: false, error: 'Not authenticated' }
      }

      // Try a simple profile read to test RLS
      const { error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (error?.code === '42501') {
        return { 
          configured: false, 
          error: 'RLS policies not configured properly',
          message: 'Please run the SQL commands from SUPABASE_SETUP.md in your Supabase SQL Editor'
        }
      }

      return { configured: true }
    } catch (error) {
      return { 
        configured: false, 
        error: 'Unable to check RLS configuration',
        details: error
      }
    }
  }
}