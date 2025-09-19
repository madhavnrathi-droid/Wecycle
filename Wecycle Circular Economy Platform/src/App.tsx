import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { DarkModeProvider } from './hooks/useDarkMode'
import { Auth } from './components/Auth'
import { Navigation } from './components/Navigation'
import { HomeFeed } from './components/HomeFeed'
import { DemoHomeFeed } from './components/DemoHomeFeed'
import { DistributeForm } from './components/DistributeForm'
import { RequestForm } from './components/RequestForm'
import { Inventory } from './components/Inventory'
import { GuestInventory } from './components/GuestInventory'
import { Notifications } from './components/Notifications'
import { GuestNotifications } from './components/GuestNotifications'
import { Profile } from './components/Profile'
import { GuestProfile } from './components/GuestProfile'
import { DatabaseStatus } from './components/DatabaseStatus'
import { DatabaseErrorAlert } from './components/DatabaseErrorAlert'
import { SetupBanner } from './components/SetupBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingSpinner } from './components/LoadingSpinner'
import { notificationService } from './services/notificationService'
import { isSupabaseConfigured } from './lib/supabase'
import { checkServerHealth, checkServerConfig, testServerConnection, pingServer, diagnoseConnection, checkServerStatus, debugJWT, debugWecycleKey, testJWTToken } from './lib/serverClient'
import { Toaster } from './components/ui/sonner'
import { Button } from './components/ui/button'
import { Alert, AlertDescription } from './components/ui/alert'
import { Database, AlertTriangle, RefreshCw, X, Shield } from 'lucide-react'

// Safely check if we're in development mode
const isDevelopment = (() => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.NODE_ENV === 'development'
    }
    
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

function AppContent() {
  const { user, loading, error, clearError } = useAuth()
  const [currentView, setCurrentView] = useState('home')
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [notifications, setNotifications] = useState<any[]>([])
  const [notificationLoading, setNotificationLoading] = useState(false)
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [showSetupBanner, setShowSetupBanner] = useState(false)
  const [databaseErrors, setDatabaseErrors] = useState<any[]>([])
  const [serverStatus, setServerStatus] = useState<'unknown' | 'healthy' | 'error'>('unknown')
  const [serverConfig, setServerConfig] = useState<any>(null)

  // Check server health on startup
  useEffect(() => {
    const checkServer = async () => {
      try {
        // Step 1: Test simple ping (completely public)
        console.log('🏓 Step 1: Testing server ping (no auth)...')
        const pingResult = await pingServer()
        if (!pingResult.success) {
          console.error('❌ Server ping failed:', pingResult.error)
          setServerStatus('error')
          
          // If ping fails, run full diagnosis
          try {
            const diagnosis = await diagnoseConnection()
            console.log('🔍 Ping failure diagnosis:', diagnosis)
          } catch (diagError) {
            console.error('❌ Could not run diagnosis:', diagError)
          }
          return
        } else {
          console.log('✅ Server ping successful:', pingResult.data)
        }

        // Step 2: Test server status (public endpoint)
        console.log('📊 Step 2: Testing server status (no auth)...')
        const statusResult = await checkServerStatus()
        if (statusResult.status === 'error') {
          console.error('❌ Server status check failed:', statusResult.error)
          setServerStatus('error')
          return
        } else {
          console.log('✅ Server status check passed:', statusResult)
        }

        // At this point, server is responding to public endpoints
        setServerStatus('healthy')

        // Step 3: Debug WECYCLE_KEY configuration
        console.log('🔍 Step 3: Debugging WECYCLE_KEY configuration...')
        const wecycleKeyDebug = await debugWecycleKey()
        if (wecycleKeyDebug.success) {
          console.log('🔍 WECYCLE_KEY Debug successful:', wecycleKeyDebug.data)
          
          if (wecycleKeyDebug.data.potentialIssues?.length > 0) {
            console.warn('⚠️ WECYCLE_KEY has potential issues:', wecycleKeyDebug.data.potentialIssues)
            console.log('💡 Suggestion:', wecycleKeyDebug.data.suggestion)
            
            // Create a clear error message for the user
            const wecycleError = {
              error: {
                code: 'INVALID_WECYCLE_KEY',
                message: 'WECYCLE_KEY configuration is invalid',
                details: wecycleKeyDebug.data.potentialIssues,
                suggestion: wecycleKeyDebug.data.suggestion,
                correctFormat: wecycleKeyDebug.data.correctFormat,
                instructions: wecycleKeyDebug.data.instructions
              },
              context: 'WECYCLE_KEY Environment Variable Configuration'
            }
            
            handleDatabaseError(wecycleError.error, wecycleError.context)
          }
        } else {
          console.error('❌ WECYCLE_KEY debug failed:', wecycleKeyDebug.error)
          // Still try to create a helpful error
          const debugError = {
            error: {
              code: 'WECYCLE_KEY_DEBUG_FAILED',
              message: `Could not debug WECYCLE_KEY: ${wecycleKeyDebug.error?.error || wecycleKeyDebug.error}`,
              hint: 'Check server logs for more details'
            },
            context: 'WECYCLE_KEY Debug Process'
          }
          handleDatabaseError(debugError.error, debugError.context)
        }

        // Step 4: Debug JWT before trying protected endpoints
        console.log('🐛 Step 4: Debugging JWT configuration...')
        const jwtDebug = await debugJWT()
        if (jwtDebug.success) {
          console.log('🔍 JWT Debug successful:', jwtDebug.data)
          
          // Check if tokens match
          if (!jwtDebug.data.tokensMatch) {
            console.warn('⚠️ JWT tokens do not match - protected endpoints may fail')
            console.log('Expected anon key:', jwtDebug.data.expectedAnonKey)
            console.log('Received token:', jwtDebug.data.tokenPrefix)
          }
        } else {
          console.error('❌ JWT debug failed:', jwtDebug.error)
        }

        // Step 4: Test full connectivity including protected endpoints
        console.log('🧪 Step 4: Testing full server connectivity...')
        const connectionTest = await testServerConnection()
        if (!connectionTest.success) {
          console.warn('⚠️ Full connection test failed:', connectionTest.error)
          // Server is still considered healthy if public endpoints work
          console.log('✅ Server is healthy (public endpoints working)')
        } else {
          console.log('✅ Full server connection test passed:', connectionTest.data)
        }

        // Step 5: Try protected endpoints (optional)
        try {
          console.log('🏥 Step 5: Testing health endpoint (protected)...')
          const healthResult = await checkServerHealth()
          if (healthResult.status === 'ok') {
            console.log('✅ Server health check passed:', healthResult)
            
            // Also check server configuration
            try {
              const configResult = await checkServerConfig()
              setServerConfig(configResult)
              console.log('🔧 Server config:', configResult)
            } catch (configError) {
              console.warn('⚠️ Could not fetch server config:', configError)
            }
          } else {
            console.warn('⚠️ Server health check failed:', healthResult)
          }
        } catch (healthError) {
          console.warn('⚠️ Health check failed (JWT issue):', healthError.message)
          console.log('💡 This is expected if WECYCLE_KEY is not configured')
        }

      } catch (error) {
        setServerStatus('error')
        console.error('❌ Server check error:', error)
        // Run comprehensive diagnosis for unexpected errors
        try {
          const diagnosis = await diagnoseConnection()
          console.log('🔍 Comprehensive error diagnosis:', diagnosis)
        } catch (diagError) {
          console.error('❌ Could not run diagnosis:', diagError)
        }
      }
    }

    checkServer()
  }, [])

  // Load notifications when user is authenticated and Supabase is configured
  useEffect(() => {
    if (user && isSupabaseConfigured) {
      loadNotifications()
      
      // Subscribe to real-time notifications with error handling
      try {
        const subscription = notificationService.subscribeToNotifications(
          user.id,
          (payload) => {
            setNotifications(prev => [payload.new, ...prev])
          }
        )

        return () => {
          if (subscription && subscription.unsubscribe) {
            subscription.unsubscribe()
          }
        }
      } catch (error) {
        console.error('Error setting up notification subscription:', error)
        setNotificationError('Failed to connect to real-time notifications.')
      }
    }
  }, [user])

  // Handle navigation for deep links with improved error handling
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '')
      const validViews = ['home', 'distribute', 'acquire', 'inventory', 'notifications', 'profile', 'database']
      if (validViews.includes(hash)) {
        setCurrentView(hash)
      } else {
        // Default to home for invalid routes
        setCurrentView('home')
        window.history.replaceState(null, '', '#home')
      }
    }

    window.addEventListener('popstate', handlePopState)
    handlePopState() // Handle initial load

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Update URL when view changes
  useEffect(() => {
    if (currentView) {
      window.history.replaceState(null, '', `#${currentView}`)
    }
  }, [currentView])

  const loadNotifications = async () => {
    if (!user || !isSupabaseConfigured) return
    
    try {
      setNotificationLoading(true)
      setNotificationError(null)
      const data = await notificationService.getUserNotifications(user.id)
      setNotifications(data || [])
    } catch (error) {
      console.error('Error loading notifications:', error)
      setNotifications([])
      setNotificationError('Failed to load notifications. Please check your connection.')
    } finally {
      setNotificationLoading(false)
    }
  }

  const retryConnection = () => {
    clearError()
    setNotificationError(null)
    setDatabaseErrors([])
    if (user && isSupabaseConfigured) {
      loadNotifications()
    }
  }

  const handleDatabaseError = (error: any, context: string) => {
    const errorInfo = {
      error,
      context,
      timestamp: new Date().toISOString()
    }
    
    setDatabaseErrors(prev => {
      // Avoid duplicate errors
      const exists = prev.some(e => 
        e.error?.code === error?.code && 
        e.context === context
      )
      if (exists) return prev
      return [errorInfo, ...prev.slice(0, 2)] // Keep only latest 3 errors
    })
  }

  const dismissDatabaseError = (index: number) => {
    setDatabaseErrors(prev => prev.filter((_, i) => i !== index))
  }

  // Simplified navigation handler - no auth blocking, just track user state
  const handleViewChange = (view: string) => {
    setCurrentView(view)
  }

  const handleSignInRequired = (mode: 'signin' | 'signup' = 'signin') => {
    setAuthMode(mode)
    setShowAuth(true)
  }

  const handleAuthClose = () => {
    setShowAuth(false)
  }

  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.is_read).length

  const renderCurrentView = () => {
    if (!isSupabaseConfigured) {
      // Demo mode - show demo content for browsing views, guest overlays for others
      switch (currentView) {
        case 'home':
          return <DemoHomeFeed onViewChange={handleViewChange} />
        case 'distribute':
          return <DistributeForm 
            onBack={() => setCurrentView('home')} 
            onDatabaseError={handleDatabaseError} 
            isDemo 
            isGuest={!user}
            onSignIn={() => handleSignInRequired('signin')}
            onSignUp={() => handleSignInRequired('signup')}
          />
        case 'acquire':
          return <RequestForm 
            onBack={() => setCurrentView('home')} 
            onDatabaseError={handleDatabaseError} 
            isDemo 
            isGuest={!user}
            onSignIn={() => handleSignInRequired('signup')} 
            onSignUp={() => handleSignInRequired('signup')} 
          />
        case 'inventory':
          return <GuestInventory onSignIn={() => handleSignInRequired('signin')} onSignUp={() => handleSignInRequired('signup')} />
        case 'notifications':
          return <GuestNotifications onSignIn={() => handleSignInRequired('signin')} onSignUp={() => handleSignInRequired('signup')} />
        case 'profile':
          return <GuestProfile onSignIn={() => handleSignInRequired('signin')} onSignUp={() => handleSignInRequired('signup')} />
        case 'database':
          return <DatabaseStatus />
        default:
          return <DemoHomeFeed onViewChange={handleViewChange} />
      }
    }
    
    // Full functionality when Supabase is configured
    switch (currentView) {
      case 'home':
        return <HomeFeed onViewChange={handleViewChange} onDatabaseError={handleDatabaseError} />
      case 'distribute':
        if (!user) {
          return <DistributeForm 
            onBack={() => setCurrentView('home')} 
            onDatabaseError={handleDatabaseError} 
            isGuest 
            onSignIn={() => handleSignInRequired('signin')} 
            onSignUp={() => handleSignInRequired('signup')} 
          />
        }
        return <DistributeForm onBack={() => setCurrentView('home')} onDatabaseError={handleDatabaseError} />
      case 'acquire':
        if (!user) {
          return <RequestForm 
            onBack={() => setCurrentView('home')} 
            onDatabaseError={handleDatabaseError} 
            isGuest 
            onSignIn={() => handleSignInRequired('signup')} 
            onSignUp={() => handleSignInRequired('signup')} 
          />
        }
        return <RequestForm onBack={() => setCurrentView('home')} onDatabaseError={handleDatabaseError} />
      case 'inventory':
        if (!user) {
          return <GuestInventory onSignIn={() => handleSignInRequired('signin')} onSignUp={() => handleSignInRequired('signup')} />
        }
        return <Inventory onDatabaseError={handleDatabaseError} />
      case 'notifications':
        if (!user) {
          return <GuestNotifications onSignIn={() => handleSignInRequired('signin')} onSignUp={() => handleSignInRequired('signup')} />
        }
        return (
          <Notifications 
            notifications={notifications}
            loading={notificationLoading}
            onNotificationUpdate={loadNotifications}
            onDatabaseError={handleDatabaseError}
          />
        )
      case 'profile':
        if (!user) {
          return <GuestProfile onSignIn={() => handleSignInRequired('signin')} onSignUp={() => handleSignInRequired('signup')} />
        }
        return <Profile onDatabaseError={handleDatabaseError} />
      case 'database':
        return <DatabaseStatus />
      default:
        return <HomeFeed onViewChange={handleViewChange} onDatabaseError={handleDatabaseError} />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0B1F17] flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner className="h-12 w-12 mx-auto mb-4 text-green-600" />
          <h3 className="text-green-700 dark:text-green-400 mb-2 font-medium">Welcome to Wecycle</h3>
          <p className="text-gray-600 dark:text-[#B0B7B4]">Setting up your sustainable marketplace...</p>
        </div>
      </div>
    )
  }

  // Show auth modal if requested
  if (showAuth) {
    return (
      <ErrorBoundary>
        <Auth onClose={handleAuthClose} initialMode={authMode} />
      </ErrorBoundary>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0B1F17] flex flex-col">
      {/* Database Configuration Errors */}
      {databaseErrors.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-950 border-b border-orange-200 dark:border-orange-800 p-4">
          <div className="max-w-6xl mx-auto space-y-4">
            {databaseErrors.map((errorInfo, index) => (
              <DatabaseErrorAlert
                key={`${errorInfo.timestamp}-${index}`}
                error={errorInfo.error}
                context={errorInfo.context}
                onRetry={retryConnection}
                onClose={() => dismissDatabaseError(index)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Network/Connection Error Banner */}
      {(error || notificationError) && (
        <div className="bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 p-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-red-800 dark:text-red-200 text-sm font-medium">
                  {error || notificationError}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={retryConnection}
                className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900 font-medium"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearError()
                  setNotificationError(null)
                }}
                className="text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Database Setup Required Banner */}
      {isSupabaseConfigured && databaseErrors.some(e => 
        e.error?.code === '42501' || e.error?.code === '23502'
      ) && (
        <div className="bg-orange-50 dark:bg-orange-950 border-b border-orange-200 dark:border-orange-800 p-4">
          <div className="max-w-6xl mx-auto">
            <Alert className="border-orange-300 bg-orange-100 dark:bg-orange-900 dark:border-orange-700">
              <Shield className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800 dark:text-orange-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Database Configuration Required</p>
                    <p className="text-sm mt-1">
                      Your Supabase database needs proper schema and security policies. 
                      Some features may not work until this is completed.
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentView('database')}
                      className="border-orange-300 text-orange-700 hover:bg-orange-200 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-800"
                    >
                      <Database className="w-4 h-4 mr-1" />
                      Setup Guide
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                      className="border-orange-300 text-orange-700 hover:bg-orange-200 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-800"
                    >
                      <Shield className="w-4 h-4 mr-1" />
                      Dashboard
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}
      
      <Navigation 
        currentView={currentView} 
        onViewChange={handleViewChange}
        notificationCount={unreadCount}
        showSetupButton={!isSupabaseConfigured}
        onSetupClick={() => setShowSetupBanner(true)}
        user={user}
        onSignInClick={() => handleSignInRequired('signin')}
        onSignUpClick={() => handleSignInRequired('signup')}
      />
      
      <ErrorBoundary>
        {/* Main content with proper spacing and responsive design */}
        <main className="flex-1 pb-6 md:pb-8 pb-20">
          {renderCurrentView()}
        </main>
      </ErrorBoundary>
      
      {/* Improved Footer */}
      <footer className="bg-white dark:bg-[#0B1F17] border-t border-gray-200 dark:border-[#1C3A30] py-12 mt-auto mb-20 md:mb-0">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-1">
              <h3 className="text-green-700 dark:text-green-400 mb-4 font-semibold">Wecycle</h3>
              <p className="text-gray-600 dark:text-[#B0B7B4] text-sm leading-relaxed">
                Building a circular economy through community sharing and material reuse. 
                Join our sustainable marketplace today.
              </p>
            </div>
            
            <div>
              <h4 className="text-gray-900 dark:text-[#E5EAE8] mb-4 font-medium">Platform</h4>
              <ul className="space-y-3 text-sm text-gray-600 dark:text-[#B0B7B4]">
                <li>
                  <button 
                    onClick={() => handleViewChange('home')} 
                    className="hover:text-green-600 dark:hover:text-green-400 transition-colors text-left"
                  >
                    Browse Materials
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => handleViewChange('distribute')} 
                    className="hover:text-green-600 dark:hover:text-green-400 transition-colors text-left"
                  >
                    Share Items
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => handleViewChange('acquire')} 
                    className="hover:text-green-600 dark:hover:text-green-400 transition-colors text-left"
                  >
                    Post Requests
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => handleViewChange('inventory')} 
                    className="hover:text-green-600 dark:hover:text-green-400 transition-colors text-left"
                  >
                    My Inventory
                  </button>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-gray-900 dark:text-[#E5EAE8] mb-4 font-medium">Community</h4>
              <ul className="space-y-3 text-sm text-gray-600 dark:text-[#B0B7B4]">
                <li><a href="#" className="hover:text-green-600 dark:hover:text-green-400 transition-colors">Community Guidelines</a></li>
                <li><a href="#" className="hover:text-green-600 dark:hover:text-green-400 transition-colors">Success Stories</a></li>
                <li><a href="#" className="hover:text-green-600 dark:hover:text-green-400 transition-colors">Local Events</a></li>
                <li><a href="#" className="hover:text-green-600 dark:hover:text-green-400 transition-colors">Sustainability Tips</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-gray-900 dark:text-[#E5EAE8] mb-4 font-medium">Support</h4>
              <ul className="space-y-3 text-sm text-gray-600 dark:text-[#B0B7B4]">
                <li><a href="#" className="hover:text-green-600 dark:hover:text-green-400 transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-green-600 dark:hover:text-green-400 transition-colors">Contact Us</a></li>
                <li><a href="#" className="hover:text-green-600 dark:hover:text-green-400 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-green-600 dark:hover:text-green-400 transition-colors">Terms of Service</a></li>
                {isDevelopment && (
                  <li>
                    <button 
                      onClick={() => setCurrentView('database')} 
                      className="hover:text-green-600 dark:hover:text-green-400 transition-colors text-left"
                    >
                      Database Status
                    </button>
                  </li>
                )}
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-200 dark:border-[#1C3A30] mt-10 pt-8 text-center text-sm text-gray-500 dark:text-[#B0B7B4]">
            <p>© 2025 Wecycle. Made with ♻️ for a sustainable future.</p>
            {isDevelopment && (
              <p className="mt-3 text-xs text-gray-400">
                Development Mode | Supabase: {isSupabaseConfigured ? '✅ Connected' : '❌ Not configured'} | 
                Server: {serverStatus === 'healthy' ? '✅ Online' : serverStatus === 'error' ? '❌ Offline' : '🔄 Checking...'} |
                WECYCLE_KEY: {serverConfig?.wecycleKeyConfigured ? '✅ Configured' : '❌ Not set'}
                {databaseErrors.length > 0 && ' | ⚠️ Database configuration issues detected'}
              </p>
            )}
          </div>
        </div>
      </footer>
      
      {/* Toast notifications with improved positioning */}
      <Toaster 
        position="top-right" 
        toastOptions={{
          duration: 4000,
          className: 'dark:bg-[#122821] dark:text-[#E5EAE8] dark:border-[#1C3A30]'
        }}
      />
      
      {/* Setup Banner */}
      {showSetupBanner && (
        <div className="fixed inset-0 z-50">
          <SetupBanner />
          <Button
            variant="ghost"
            onClick={() => setShowSetupBanner(false)}
            className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70"
            aria-label="Close setup banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <DarkModeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </DarkModeProvider>
    </ErrorBoundary>
  )
}