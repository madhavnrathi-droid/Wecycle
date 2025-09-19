import { createClient } from '@supabase/supabase-js'

// Safely get environment variables that work in both browser and Node.js environments
const getEnvVar = (key: string): string | undefined => {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // In browser, check for environment variables that might be injected at build time
    // These would typically be available as window.ENV or similar
    return undefined
  }
  
  // In Node.js environment, safely access process.env
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key]
  }
  
  return undefined
}

// Enhanced function to get Supabase configuration from WECYCLE_KEY
const getSupabaseConfig = () => {
  // First, try to get credentials from WECYCLE_KEY (preferred method)
  const wecycleKey = getEnvVar('WECYCLE_KEY')
  if (wecycleKey) {
    try {
      const config = JSON.parse(wecycleKey)
      if (config.supabaseUrl && config.supabaseAnonKey) {
        console.log('✅ Successfully parsed WECYCLE_KEY configuration')
        return {
          url: config.supabaseUrl,
          anonKey: config.supabaseAnonKey,
          serviceRoleKey: config.supabaseServiceRoleKey || null
        }
      }
    } catch (error) {
      console.warn('❌ Failed to parse WECYCLE_KEY environment variable:', error)
    }
  }

  // Check for individual environment variables as fallback
  const envUrl = getEnvVar('REACT_APP_SUPABASE_URL') || getEnvVar('SUPABASE_URL')
  const envAnonKey = getEnvVar('REACT_APP_SUPABASE_ANON_KEY') || getEnvVar('SUPABASE_ANON_KEY')
  const envServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY')

  if (envUrl && envAnonKey) {
    console.log('✅ Using individual environment variables')
    return { 
      url: envUrl, 
      anonKey: envAnonKey,
      serviceRoleKey: envServiceKey || null
    }
  }

  // Fall back to valid configuration that matches server exactly
  console.log('⚠️ Using valid Supabase configuration (matches server exactly)')
  return {
    url: 'https://wzgalvcieeiazqqdmsrd.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Z2FsdmNpZWVpYXpxcWRtc3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc5MjI5MTMsImV4cCI6MjA1MzQ5ODkxM30.kgYf5JH2LmJrq8XyVwNzCiKfOB_qY3Tr9CpqN1xGjVw',
    serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Z2FsdmNpZWVpYXpxcWRtc3JkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5MjExMywiZXhwIjoyMDcxMDY4MTEzfQ.C6hD-LNWNGC4qjeV65_bkIMr8Iy6mW6u5zhAhH2rlLQ'
  }
}

const config = getSupabaseConfig()
const supabaseUrl = config.url
const supabaseAnonKey = config.anonKey

// Detect if using valid configuration
const isConfigured = supabaseUrl.startsWith('https://') && 
                    !supabaseUrl.includes('your-project.supabase.co') && 
                    !supabaseUrl.includes('figma.site') && // Figma URLs are not valid Supabase URLs
                    supabaseUrl.includes('.supabase.co') && // Must be a real Supabase URL
                    supabaseAnonKey.length > 20 && 
                    !supabaseAnonKey.includes('your-anon-key-here') &&
                    supabaseAnonKey.startsWith('eyJ') // JWT tokens start with eyJ

// Create a mock client for development when not configured
const mockClient = {
  auth: {
    signUp: async () => ({ error: { message: 'Please configure Supabase to use authentication' } }),
    signInWithPassword: async () => ({ error: { message: 'Please configure Supabase to use authentication' } }),
    signOut: async () => ({ error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        in: () => ({
          order: () => Promise.resolve({ data: [], error: null })
        })
      }),
      order: () => Promise.resolve({ data: [], error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      in: () => Promise.resolve({ data: [], error: null }),
      or: () => ({
        order: () => Promise.resolve({ data: [], error: null })
      })
    }),
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } })
      })
    }),
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ error: { message: 'Supabase not configured' } })
        })
      })
    }),
    delete: () => ({
      eq: () => Promise.resolve({ error: { message: 'Supabase not configured' } })
    })
  }),
  storage: {
    from: () => ({
      upload: async () => ({ error: { message: 'Supabase not configured' } }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      remove: async () => ({ error: { message: 'Supabase not configured' } })
    })
  },
  channel: () => ({
    on: () => ({ 
      subscribe: () => ({
        unsubscribe: () => {}
      })
    })
  })
}

// Create the actual client only if properly configured
let actualClient
try {
  if (isConfigured) {
    actualClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      global: {
        headers: {
          'x-application-name': 'wecycle'
        }
      }
    })
    console.log('✅ Supabase client initialized successfully')
  }
} catch (error) {
  console.warn('❌ Failed to create Supabase client:', error)
  actualClient = null
}

// Export the client (real or mock) - no wrapper needed, handle errors in services
export const supabase = actualClient || mockClient

// Export configuration status
export const isSupabaseConfigured = isConfigured && !!actualClient

// Export configuration details for server communication
export const supabaseConfig = config

// Helper function for wrapping individual operations with error handling
export const withErrorHandling = async (operation, operationName, fallbackValue) => {
  try {
    return await operation()
  } catch (error) {
    // Handle network errors specifically
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      console.error(`Network error during ${operationName}:`, error)
      const networkError = { 
        data: fallbackValue || null, 
        error: { message: 'Network connection error. Please check your internet connection and try again.' } 
      }
      return networkError
    }
    
    // Handle other errors
    console.error(`Error during ${operationName}:`, error)
    if (fallbackValue !== undefined) {
      return { data: fallbackValue, error }
    }
    throw error
  }
}

// Safely check if we're in development mode
const isDevelopment = (() => {
  try {
    // Check if NODE_ENV is available
    if (typeof process !== 'undefined' && process.env) {
      return process.env.NODE_ENV === 'development'
    }
    
    // Fallback check for development indicators
    if (typeof window !== 'undefined') {
      return window.location.hostname === 'localhost' || 
             window.location.hostname === '127.0.0.1' ||
             window.location.hostname.includes('figma.site')
    }
    
    return false
  } catch {
    return false
  }
})()

// Database types based on our corrected schema
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          name: string
          email: string
          avatar_url?: string
          location: string
          bio?: string
          phone?: string
          website?: string
        }
        Insert: {
          id: string
          name: string
          email: string
          avatar_url?: string
          location?: string
          bio?: string
          phone?: string
          website?: string
        }
        Update: {
          name?: string
          email?: string
          avatar_url?: string
          location?: string
          bio?: string
          phone?: string
          website?: string
        }
      }
      uploads: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          user_id: string
          title: string
          description: string
          category: string
          location: string
          dimensions?: string
          price?: number
          images: string[]
          expires_at?: string
          status: 'active' | 'lapsed' | 'acquired'
          is_acquired: boolean
          max_duration?: number
        }
        Insert: {
          user_id: string
          title: string
          description: string
          category: string
          location: string
          dimensions?: string
          price?: number
          images?: string[]
          expires_at?: string
          status?: 'active' | 'lapsed' | 'acquired'
          is_acquired?: boolean
          max_duration?: number
        }
        Update: {
          title?: string
          description?: string
          category?: string
          location?: string
          dimensions?: string
          price?: number
          images?: string[]
          expires_at?: string
          status?: 'active' | 'lapsed' | 'acquired'
          is_acquired?: boolean
          max_duration?: number
        }
      }
      requests: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          user_id: string
          title: string
          description: string
          category: string
          location: string
          reference_image?: string
          notes?: string
          expires_at: string
          status: 'active' | 'inactive' | 'completed'
        }
        Insert: {
          user_id: string
          title: string
          description: string
          category: string
          location: string
          reference_image?: string
          notes?: string
          expires_at: string
          status?: 'active' | 'inactive' | 'completed'
        }
        Update: {
          title?: string
          description?: string
          category?: string
          location?: string
          reference_image?: string
          notes?: string
          expires_at?: string
          status?: 'active' | 'inactive' | 'completed'
        }
      }
      request_responses: {
        Row: {
          id: string
          created_at: string
          request_id: string
          user_id: string
          message: string
        }
        Insert: {
          request_id: string
          user_id: string
          message: string
        }
        Update: {
          message?: string
        }
      }
      saved_items: {
        Row: {
          id: string
          created_at: string
          user_id: string
          upload_id: string
        }
        Insert: {
          user_id: string
          upload_id: string
        }
        Update: never
      }
      notifications: {
        Row: {
          id: string
          created_at: string
          user_id: string
          type: 'saved_item_removed' | 'request_response' | 'upload_acquired' | 'request_fulfilled'
          title: string
          message: string
          is_read: boolean
          related_id?: string
        }
        Insert: {
          user_id: string
          type: 'saved_item_removed' | 'request_response' | 'upload_acquired' | 'request_fulfilled'
          title: string
          message: string
          is_read?: boolean
          related_id?: string
        }
        Update: {
          is_read?: boolean
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      upload_status: 'active' | 'lapsed' | 'acquired'
      request_status: 'active' | 'inactive' | 'completed'
      notification_type: 'saved_item_removed' | 'request_response' | 'upload_acquired' | 'request_fulfilled'
    }
  }
}

// Log configuration status for debugging (only in development)
if (isDevelopment && typeof console !== 'undefined') {
  console.log('🔧 Supabase configuration:', {
    configured: isConfigured,
    hasWecycleKey: !!getEnvVar('WECYCLE_KEY'),
    hasServiceRoleKey: !!config.serviceRoleKey,
    urlValid: supabaseUrl.includes('.supabase.co'),
    keyValid: supabaseAnonKey.startsWith('eyJ'),
    environment: isDevelopment ? 'development' : 'production'
  })
}