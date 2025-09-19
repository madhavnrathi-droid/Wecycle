import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured, withErrorHandling } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string, userData: { name: string; location: string }) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // When Supabase is not configured, just set loading to false
      setLoading(false)
      return
    }
    
    // Get initial session with error handling
    const getInitialSession = async () => {
      try {
        const result = await withErrorHandling(
          () => supabase.auth.getSession(),
          'get initial session',
          { session: null }
        )
        
        if (result.error && result.error.message.includes('Network connection error')) {
          setError(result.error.message)
        } else {
          setSession(result.data?.session || null)
          setUser(result.data?.session?.user || null)
          setError(null)
        }
      } catch (error) {
        console.error('Error getting initial session:', error)
        setError('Failed to initialize authentication. Please refresh the page.')
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes with error handling
    let subscription: any
    try {
      const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          try {
            setSession(session)
            setUser(session?.user ?? null)
            setError(null)
            setLoading(false)
            
            // Clear any RLS-related errors when user signs in
            if (session?.user && event === 'SIGNED_IN') {
              console.log('User signed in successfully:', session.user.id)
            }
          } catch (error) {
            console.error('Error in auth state change:', error)
            setError('Authentication error occurred.')
            setLoading(false)
          }
        }
      )
      subscription = authSubscription
    } catch (error) {
      console.error('Error setting up auth listener:', error)
      setError('Failed to setup authentication listener.')
      setLoading(false)
    }

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe()
      }
    }
  }, [])

  const signUp = async (email: string, password: string, userData: { name: string; location: string }) => {
    setError(null)
    try {
      const result = await withErrorHandling(
        () => supabase.auth.signUp({
          email,
          password,
          options: {
            data: userData
          }
        }),
        'sign up'
      )
      
      if (result.error) {
        if (result.error.message.includes('Network connection error')) {
          setError(result.error.message)
        } else if (result.error.code === '42501') {
          setError('Account creation failed. Please try again.')
        }
      }
      
      return { error: result.error }
    } catch (error) {
      console.error('Error during sign up:', error)
      const networkError = { message: 'Network connection error. Please check your internet connection and try again.' }
      setError(networkError.message)
      return { error: networkError }
    }
  }

  const signIn = async (email: string, password: string) => {
    setError(null)
    try {
      const result = await withErrorHandling(
        () => supabase.auth.signInWithPassword({
          email,
          password
        }),
        'sign in'
      )
      
      if (result.error) {
        if (result.error.message.includes('Network connection error')) {
          setError(result.error.message)
        } else if (result.error.code === '42501') {
          setError('Access denied. Please check your credentials.')
        }
      }
      
      return { error: result.error }
    } catch (error) {
      console.error('Error during sign in:', error)
      const networkError = { message: 'Network connection error. Please check your internet connection and try again.' }
      setError(networkError.message)
      return { error: networkError }
    }
  }

  const signOut = async () => {
    setError(null)
    try {
      await withErrorHandling(
        () => supabase.auth.signOut(),
        'sign out'
      )
    } catch (error) {
      console.error('Error during sign out:', error)
      setError('Network connection error during sign out.')
    }
  }

  const updatePassword = async (newPassword: string) => {
    if (!user) {
      throw new Error('User not authenticated')
    }
    
    setError(null)
    try {
      const result = await withErrorHandling(
        () => supabase.auth.updateUser({
          password: newPassword
        }),
        'update password'
      )
      
      if (result.error) {
        if (result.error.message.includes('Network connection error')) {
          setError(result.error.message)
          throw new Error(result.error.message)
        } else if (result.error.code === '42501') {
          const rlsError = 'Failed to update password. Please try signing out and back in.'
          setError(rlsError)
          throw new Error(rlsError)
        } else {
          throw new Error(result.error.message)
        }
      }
    } catch (error) {
      console.error('Error updating password:', error)
      if (error instanceof Error) {
        throw error
      } else {
        const networkError = 'Network connection error during password update.'
        setError(networkError)
        throw new Error(networkError)
      }
    }
  }

  const clearError = () => {
    setError(null)
  }

  const value = {
    user,
    session,
    loading,
    error,
    signUp,
    signIn,
    signOut,
    updatePassword,
    clearError
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}