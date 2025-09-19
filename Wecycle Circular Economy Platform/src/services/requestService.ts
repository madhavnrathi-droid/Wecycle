import { supabase, withErrorHandling } from '../lib/supabase'
import { Request } from '../types'

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

// Validate request data
const validateRequestData = (requestData: any) => {
  const errors: string[] = []
  
  if (!requestData.title?.trim()) {
    errors.push('Title is required')
  }
  
  if (!requestData.description?.trim()) {
    errors.push('Description is required')
  }
  
  if (!requestData.category?.trim()) {
    errors.push('Category is required')
  }
  
  if (!requestData.location?.trim()) {
    errors.push('Location is required')
  }
  
  if (requestData.expires_at && new Date(requestData.expires_at) <= new Date()) {
    errors.push('Expiry date must be in the future')
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`)
  }
}

export const requestService = {
  // Get all active requests with enhanced data fetching
  async getActiveRequests() {
    try {
      // Get requests first
      const requestsResult = await withErrorHandling(
        () => supabase
          .from('requests')
          .select('*')
          .eq('status', 'active')
          .gte('expires_at', new Date().toISOString()) // Only get non-expired requests
          .order('created_at', { ascending: false }),
        'fetch active requests',
        []
      )

      if (requestsResult.error && requestsResult.error.message.includes('Network connection error')) {
        throw new Error(requestsResult.error.message)
      }

      const requestsData = requestsResult.data || []

      if (!requestsData || requestsData.length === 0) {
        return []
      }

      // Get user profiles and responses in parallel
      const userIds = [...new Set(requestsData.map(request => request.user_id))]
      const requestIds = requestsData.map(request => request.id)

      const [profilesResult, responsesResult] = await Promise.all([
        withErrorHandling(
          () => supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', userIds),
          'fetch profiles for requests',
          []
        ),
        withErrorHandling(
          () => supabase
            .from('request_responses')
            .select('id, request_id, message, created_at, user_id')
            .in('request_id', requestIds)
            .order('created_at', { ascending: false }),
          'fetch responses for requests',
          []
        )
      ])

      if (profilesResult.error) {
        console.warn('Could not fetch profiles for requests:', profilesResult.error)
      }

      if (responsesResult.error) {
        console.warn('Could not fetch responses for requests:', responsesResult.error)
      }

      // Get profiles for response authors
      const responseUserIds = [...new Set(responsesResult.data?.map(response => response.user_id) || [])]
      let responseProfiles = []
      if (responseUserIds.length > 0) {
        const responseProfilesResult = await withErrorHandling(
          () => supabase
            .from('profiles')
            .select('id, name')
            .in('id', responseUserIds),
          'fetch response profiles',
          []
        )

        if (responseProfilesResult.error) {
          console.warn('Could not fetch response profiles:', responseProfilesResult.error)
        } else {
          responseProfiles = responseProfilesResult.data || []
        }
      }

      // Manually join the data with enhanced information
      const requestsWithProfiles = requestsData.map(request => {
        const responses = responsesResult.data?.filter(response => response.request_id === request.id) || []
        const responsesWithProfiles = responses.map(response => ({
          ...response,
          profiles: responseProfiles.find(profile => profile.id === response.user_id) || null
        }))

        return {
          ...request,
          profiles: profilesResult.data?.find(profile => profile.id === request.user_id) || null,
          user_name: profilesResult.data?.find(profile => profile.id === request.user_id)?.name || 'Unknown User',
          request_responses: responsesWithProfiles,
          response_count: responsesWithProfiles.length,
          is_expired: request.expires_at ? new Date(request.expires_at) <= new Date() : false,
          days_remaining: request.expires_at ? Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : null
        }
      })

      return requestsWithProfiles
    } catch (error) {
      return handleServiceError(error, 'fetch active requests', [])
    }
  },

  // Get requests by user with enhanced filtering
  async getUserRequests(userId: string, status?: 'all' | 'active' | 'expired' | 'fulfilled') {
    try {
      // Validate authentication
      const user = await validateUserAuth('fetch user requests')
      
      if (user.id !== userId) {
        throw new Error('Access denied. You can only access your own requests.')
      }

      let query = supabase
        .from('requests')
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

      // Get user's requests
      const requestsResult = await withErrorHandling(
        () => query.order('created_at', { ascending: false }),
        'fetch user requests',
        []
      )

      if (requestsResult.error && requestsResult.error.message.includes('Network connection error')) {
        throw new Error(requestsResult.error.message)
      }

      const requestsData = requestsResult.data || []

      if (!requestsData || requestsData.length === 0) {
        return []
      }

      // Get responses for these requests
      const requestIds = requestsData.map(request => request.id)
      const responsesResult = await withErrorHandling(
        () => supabase
          .from('request_responses')
          .select('id, request_id, message, created_at, user_id')
          .in('request_id', requestIds)
          .order('created_at', { ascending: false }),
        'fetch responses for user requests',
        []
      )

      if (responsesResult.error) {
        console.warn('Could not fetch responses for user requests:', responsesResult.error)
      }

      // Get profiles for response authors
      const responseUserIds = [...new Set(responsesResult.data?.map(response => response.user_id) || [])]
      let responseProfiles = []
      if (responseUserIds.length > 0) {
        const responseProfilesResult = await withErrorHandling(
          () => supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', responseUserIds),
          'fetch response profiles for user requests',
          []
        )

        if (responseProfilesResult.error) {
          console.warn('Could not fetch response profiles:', responseProfilesResult.error)
        } else {
          responseProfiles = responseProfilesResult.data || []
        }
      }

      // Manually join the data with enhanced information
      const requestsWithResponses = requestsData.map(request => {
        const responses = responsesResult.data?.filter(response => response.request_id === request.id) || []
        const responsesWithProfiles = responses.map(response => ({
          ...response,
          profiles: responseProfiles.find(profile => profile.id === response.user_id) || null
        }))

        return {
          ...request,
          request_responses: responsesWithProfiles,
          response_count: responsesWithProfiles.length,
          is_expired: request.expires_at ? new Date(request.expires_at) <= new Date() : false,
          days_remaining: request.expires_at ? Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : null,
          latest_response: responsesWithProfiles[0] || null
        }
      })

      return requestsWithResponses
    } catch (error) {
      return handleServiceError(error, 'fetch user requests', [])
    }
  },

  // Create new request with enhanced validation
  async createRequest(requestData: {
    title: string
    description: string
    category: string
    location: string
    reference_image?: string
    notes?: string
    expires_at: string
    urgency?: 'low' | 'medium' | 'high'
    budget_range?: {
      min: number
      max: number
    }
  }) {
    try {
      // Validate authentication
      const user = await validateUserAuth('create request')

      // Validate request data
      validateRequestData(requestData)

      // Prepare the request with user_id and additional fields
      const request = {
        user_id: user.id,
        title: requestData.title.trim(),
        description: requestData.description.trim(),
        category: requestData.category,
        location: requestData.location.trim(),
        reference_image: requestData.reference_image || null,
        notes: requestData.notes?.trim() || null,
        expires_at: requestData.expires_at,
        urgency: requestData.urgency || 'medium',
        budget_range: requestData.budget_range || null,
        status: 'active',
        view_count: 0,
        response_count: 0
      }

      console.log('Creating request with data:', request)

      const result = await withErrorHandling(
        () => supabase
          .from('requests')
          .insert([request])
          .select()
          .single(),
        'create request'
      )

      if (result.error) {
        console.error('Request creation error:', result.error)
        handleServiceError(result.error, 'create request')
      }

      console.log('Request created successfully:', result.data)

      // Create notification for successful request
      try {
        await supabase
          .from('notifications')
          .insert([{
            user_id: user.id,
            type: 'request_created',
            title: 'Request posted successfully',
            message: `Your request for "${request.title}" is now live`,
            related_id: result.data.id
          }])
      } catch (notifError) {
        console.warn('Failed to create request notification:', notifError)
      }

      return result.data
    } catch (error) {
      console.error('Error in createRequest:', error)
      handleServiceError(error, 'create request')
    }
  },

  // Update request with validation
  async updateRequest(id: string, updates: Partial<Request>) {
    try {
      // Validate authentication
      const user = await validateUserAuth('update request')

      // First check if the request belongs to the user
      const { data: existingRequest, error: fetchError } = await supabase
        .from('requests')
        .select('user_id, title')
        .eq('id', id)
        .single()

      if (fetchError) {
        handleServiceError(fetchError, 'fetch request for update')
      }

      if (existingRequest?.user_id !== user.id) {
        throw new Error('Access denied. You can only update your own requests.')
      }

      // Validate update data if it contains critical fields
      if (updates.title || updates.description || updates.category || updates.location || updates.expires_at) {
        validateRequestData({ ...existingRequest, ...updates })
      }

      const result = await withErrorHandling(
        () => supabase
          .from('requests')
          .update({
            ...updates,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single(),
        'update request'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'update request')
      }

      return result.data
    } catch (error) {
      handleServiceError(error, 'update request')
    }
  },

  // Increment view count
  async incrementViewCount(id: string) {
    try {
      const result = await withErrorHandling(
        () => supabase.rpc('increment_request_view_count', { request_id: id }),
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

  // Mark request as fulfilled
  async markAsFulfilled(id: string, fulfilledBy?: string) {
    try {
      // Validate authentication
      const user = await validateUserAuth('mark request as fulfilled')

      // First check if the request belongs to the user
      const { data: existingRequest, error: fetchError } = await supabase
        .from('requests')
        .select('user_id, title')
        .eq('id', id)
        .single()

      if (fetchError) {
        handleServiceError(fetchError, 'fetch request for fulfillment')
      }

      if (existingRequest?.user_id !== user.id) {
        throw new Error('Access denied. You can only modify your own requests.')
      }

      const result = await withErrorHandling(
        () => supabase
          .from('requests')
          .update({ 
            status: 'fulfilled',
            fulfilled_by: fulfilledBy || null,
            fulfilled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select()
          .single(),
        'mark request as fulfilled'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'mark request as fulfilled')
      }

      // Create notification for fulfillment
      try {
        await supabase
          .from('notifications')
          .insert([{
            user_id: user.id,
            type: 'request_fulfilled',
            title: 'Request fulfilled',
            message: `Your request for "${existingRequest.title}" has been fulfilled`,
            related_id: id
          }])
      } catch (notifError) {
        console.warn('Failed to create fulfillment notification:', notifError)
      }

      return result.data
    } catch (error) {
      handleServiceError(error, 'mark request as fulfilled')
    }
  },

  // Add response to request with enhanced functionality
  async addResponse(requestId: string, message: string, attachments?: string[]) {
    try {
      // Validate authentication
      const user = await validateUserAuth('add response')

      // Validate input
      if (!message.trim()) {
        throw new Error('Response message cannot be empty')
      }

      // Check if request exists and is active
      const { data: request, error: requestError } = await supabase
        .from('requests')
        .select('user_id, title, status')
        .eq('id', requestId)
        .single()

      if (requestError) {
        handleServiceError(requestError, 'fetch request for response')
      }

      if (!request) {
        throw new Error('Request not found')
      }

      if (request.status !== 'active') {
        throw new Error('Cannot respond to inactive requests')
      }

      // Prevent users from responding to their own requests
      if (request.user_id === user.id) {
        throw new Error('You cannot respond to your own request')
      }

      // Insert the response
      const responseResult = await withErrorHandling(
        () => supabase
          .from('request_responses')
          .insert([{
            request_id: requestId,
            user_id: user.id,
            message: message.trim(),
            attachments: attachments || []
          }])
          .select()
          .single(),
        'add response'
      )

      if (responseResult.error) {
        handleServiceError(responseResult.error, 'add response')
      }

      // Update request response count
      try {
        await supabase.rpc('increment_request_response_count', { request_id: requestId })
      } catch (countError) {
        console.warn('Failed to update response count:', countError)
      }

      // Create notification for request owner
      try {
        await supabase
          .from('notifications')
          .insert([{
            user_id: request.user_id,
            type: 'request_response',
            title: 'New response to your request',
            message: `Someone responded to your "${request.title}" request`,
            related_id: requestId
          }])
      } catch (notifError) {
        console.warn('Could not create notification:', notifError)
      }

      // Get user profile for the response
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('id', user.id)
        .single()

      return {
        ...responseResult.data,
        profiles: userProfile || null
      }
    } catch (error) {
      handleServiceError(error, 'add response')
    }
  },

  // Delete request
  async deleteRequest(id: string) {
    try {
      // Validate authentication
      const user = await validateUserAuth('delete request')

      // First check if the request belongs to the user and get details for cleanup
      const { data: existingRequest, error: fetchError } = await supabase
        .from('requests')
        .select('user_id, reference_image, title')
        .eq('id', id)
        .single()

      if (fetchError) {
        handleServiceError(fetchError, 'fetch request for deletion')
      }

      if (existingRequest?.user_id !== user.id) {
        throw new Error('Access denied. You can only delete your own requests.')
      }

      // Delete associated reference image from storage if exists
      if (existingRequest.reference_image) {
        try {
          // Use uploadService to delete the image
          const { uploadService } = await import('./uploadService')
          await uploadService.deleteImage(existingRequest.reference_image, 'reference_images')
        } catch (imageError) {
          console.warn('Failed to delete reference image:', existingRequest.reference_image, imageError)
        }
      }

      // Delete the request (cascade will handle responses)
      const result = await withErrorHandling(
        () => supabase
          .from('requests')
          .delete()
          .eq('id', id),
        'delete request'
      )

      if (result.error && !result.error.message.includes('Network connection error')) {
        handleServiceError(result.error, 'delete request')
      }

      // Create notification for deletion
      try {
        await supabase
          .from('notifications')
          .insert([{
            user_id: user.id,
            type: 'request_deleted',
            title: 'Request removed',
            message: `Your request for "${existingRequest.title}" has been removed`,
            related_id: id
          }])
      } catch (notifError) {
        console.warn('Failed to create deletion notification:', notifError)
      }

      return true
    } catch (error) {
      handleServiceError(error, 'delete request')
      return false
    }
  },

  // Search requests with advanced filtering
  async searchRequests(query: string, category?: string, filters?: {
    location?: string
    urgency?: 'low' | 'medium' | 'high'
    budgetRange?: [number, number]
    sortBy?: 'newest' | 'oldest' | 'urgency' | 'expiring_soon' | 'most_responses'
  }) {
    try {
      let queryBuilder = supabase
        .from('requests')
        .select('*')
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString())

      if (query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${query}%,description.ilike.%${query}%,category.ilike.%${query}%`)
      }

      if (category && category !== 'all') {
        queryBuilder = queryBuilder.eq('category', category)
      }

      if (filters?.location) {
        queryBuilder = queryBuilder.ilike('location', `%${filters.location}%`)
      }

      if (filters?.urgency) {
        queryBuilder = queryBuilder.eq('urgency', filters.urgency)
      }

      // Apply sorting
      switch (filters?.sortBy) {
        case 'oldest':
          queryBuilder = queryBuilder.order('created_at', { ascending: true })
          break
        case 'urgency':
          queryBuilder = queryBuilder.order('urgency', { ascending: false })
          break
        case 'expiring_soon':
          queryBuilder = queryBuilder.order('expires_at', { ascending: true })
          break
        case 'most_responses':
          queryBuilder = queryBuilder.order('response_count', { ascending: false })
          break
        default:
          queryBuilder = queryBuilder.order('created_at', { ascending: false })
      }

      const requestsResult = await withErrorHandling(
        () => queryBuilder,
        'search requests',
        []
      )

      if (requestsResult.error && requestsResult.error.message.includes('Network connection error')) {
        throw new Error(requestsResult.error.message)
      }

      const requestsData = requestsResult.data || []

      if (!requestsData || requestsData.length === 0) {
        return []
      }

      // Get user profiles and response counts in parallel
      const userIds = [...new Set(requestsData.map(request => request.user_id))]
      const requestIds = requestsData.map(request => request.id)

      const [profilesResult, responsesResult] = await Promise.all([
        withErrorHandling(
          () => supabase
            .from('profiles')
            .select('id, name, avatar_url')
            .in('id', userIds),
          'fetch profiles for search',
          []
        ),
        withErrorHandling(
          () => supabase
            .from('request_responses')
            .select('id, request_id')
            .in('request_id', requestIds),
          'fetch responses for search',
          []
        )
      ])

      if (profilesResult.error) {
        console.warn('Could not fetch profiles for search:', profilesResult.error)
      }

      if (responsesResult.error) {
        console.warn('Could not fetch responses for search:', responsesResult.error)
      }

      // Manually join the data with enhanced information
      const requestsWithProfiles = requestsData.map(request => ({
        ...request,
        profiles: profilesResult.data?.find(profile => profile.id === request.user_id) || null,
        user_name: profilesResult.data?.find(profile => profile.id === request.user_id)?.name || 'Unknown User',
        request_responses: responsesResult.data?.filter(response => response.request_id === request.id) || [],
        response_count: responsesResult.data?.filter(response => response.request_id === request.id).length || 0,
        is_expired: request.expires_at ? new Date(request.expires_at) <= new Date() : false,
        days_remaining: request.expires_at ? Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : null
      }))

      return requestsWithProfiles
    } catch (error) {
      return handleServiceError(error, 'search requests', [])
    }
  },

  // Get request statistics for user
  async getUserRequestStats(userId: string) {
    try {
      // Validate authentication
      const user = await validateUserAuth('get request statistics')
      
      if (user.id !== userId) {
        throw new Error('Access denied. You can only access your own statistics.')
      }

      const { data, error } = await supabase
        .from('requests')
        .select('status, created_at, response_count, view_count')
        .eq('user_id', userId)

      if (error) {
        handleServiceError(error, 'get request statistics')
      }

      const requests = data || []
      const now = new Date()
      
      return {
        total: requests.length,
        active: requests.filter(r => r.status === 'active').length,
        fulfilled: requests.filter(r => r.status === 'fulfilled').length,
        expired: requests.filter(r => r.status === 'expired').length,
        total_responses: requests.reduce((sum, r) => sum + (r.response_count || 0), 0),
        total_views: requests.reduce((sum, r) => sum + (r.view_count || 0), 0),
        this_month: requests.filter(r => {
          const requestDate = new Date(r.created_at)
          return requestDate.getMonth() === now.getMonth() && requestDate.getFullYear() === now.getFullYear()
        }).length
      }
    } catch (error) {
      return handleServiceError(error, 'get request statistics', {
        total: 0,
        active: 0,
        fulfilled: 0,
        expired: 0,
        total_responses: 0,
        total_views: 0,
        this_month: 0
      })
    }
  }
}