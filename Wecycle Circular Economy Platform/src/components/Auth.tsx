import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { AnimatedToggle } from './ui/animated-toggle'
import { Alert, AlertDescription } from './ui/alert'
import { Recycle, Mail, Lock, User, X } from 'lucide-react'

interface AuthProps {
  onClose?: () => void
  initialMode?: 'signin' | 'signup'
}

export function Auth({ onClose, initialMode = 'signin' }: AuthProps) {
  const { signUp, signIn } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({})
  const [authMode, setAuthMode] = useState(initialMode)
  
  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    name: ''
  })
  
  const [signInData, setSignInData] = useState({
    email: '',
    password: ''
  })

  // Simple validation functions
  const validateEmail = (email: string) => {
    return email.includes('@') && email.includes('.')
  }

  const validatePassword = (password: string) => {
    return password.length >= 6
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setValidationErrors({})

    // Custom validation
    const errors: {[key: string]: string} = {}
    
    if (!signUpData.name.trim()) {
      errors.name = 'Name is required'
    }
    
    if (!validateEmail(signUpData.email)) {
      errors.email = 'Please enter a valid email address'
    }
    
    if (!validatePassword(signUpData.password)) {
      errors.password = 'Password must be at least 6 characters'
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setLoading(true)

    const { error } = await signUp(
      signUpData.email,
      signUpData.password,
      {
        name: signUpData.name
      }
    )

    if (error) {
      setError(error.message)
    } else {
      // Close modal on successful signup
      onClose?.()
    }
    setLoading(false)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setValidationErrors({})

    // Custom validation
    const errors: {[key: string]: string} = {}
    
    if (!validateEmail(signInData.email)) {
      errors.email = 'Please enter a valid email address'
    }
    
    if (!validatePassword(signInData.password)) {
      errors.password = 'Password must be at least 6 characters'
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setLoading(true)

    const { error } = await signIn(signInData.email, signInData.password)

    if (error) {
      setError(error.message)
    } else {
      // Close modal on successful signin
      onClose?.()
    }
    setLoading(false)
  }

  const isModal = !!onClose

  return (
    <div className={`${isModal ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/50' : 'min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-[#0B1F17] dark:to-[#122821] flex items-center justify-center p-4'}`}>
      <div className={`w-full max-w-md ${isModal ? 'mx-4' : ''}`}>
        {!isModal && (
          /* Logo/Header - only show when not in modal mode */
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-[#145C45] rounded-full mb-4">
              <Recycle className="w-8 h-8 text-green-600 dark:text-green-300" />
            </div>
            <h1 className="text-green-700 dark:text-green-400 mb-2">Welcome to Wecycle</h1>
            <p className="text-gray-600 dark:text-[#B0B7B4]">Join the circular economy community</p>
          </div>
        )}

        <Card className={`dark:bg-[#122821] dark:border-[#1C3A30] ${isModal ? 'relative' : ''}`}>
          {isModal && (
            <Button
              variant="ghost"
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-600 dark:text-[#B0B7B4] hover:text-gray-900 dark:hover:text-[#E5EAE8] z-10"
              size="sm"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          <CardHeader className="text-center pb-4">
            <CardTitle className="dark:text-[#E5EAE8]">
              {isModal ? 'Join Wecycle' : 'Get Started'}
            </CardTitle>
            {isModal && (
              <p className="text-sm text-gray-600 dark:text-[#B0B7B4] mt-2">
                Sign in or create an account to access all features
              </p>
            )}
          </CardHeader>
          <CardContent>
            {/* Animated Toggle for Auth Mode */}
            <div className="mb-6">
              <AnimatedToggle
                options={[
                  { value: 'signin', label: 'Sign In' },
                  { value: 'signup', label: 'Sign Up' }
                ]}
                value={authMode}
                onChange={setAuthMode}
                className="w-full"
              />
            </div>

            {error && (
              <Alert className="mb-4 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                <AlertDescription className="text-red-700 dark:text-red-200">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {authMode === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="signin-email" className="dark:text-[#E5EAE8]">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-[#B0B7B4] w-4 h-4" />
                    <Input
                      id="signin-email"
                      type="text"
                      value={signInData.email}
                      onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                      placeholder="your@email.com"
                      className="pl-10 dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.email}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="signin-password" className="dark:text-[#E5EAE8]">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-[#B0B7B4] w-4 h-4" />
                    <Input
                      id="signin-password"
                      type="password"
                      value={signInData.password}
                      onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                      placeholder="Password"
                      className="pl-10 dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                    />
                  </div>
                  {validationErrors.password && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.password}</p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="signup-name" className="dark:text-[#E5EAE8]">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-[#B0B7B4] w-4 h-4" />
                    <Input
                      id="signup-name"
                      type="text"
                      value={signUpData.name}
                      onChange={(e) => setSignUpData({ ...signUpData, name: e.target.value })}
                      placeholder="Your full name"
                      className="pl-10 dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                    />
                  </div>
                  {validationErrors.name && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.name}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="signup-email" className="dark:text-[#E5EAE8]">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-[#B0B7B4] w-4 h-4" />
                    <Input
                      id="signup-email"
                      type="text"
                      value={signUpData.email}
                      onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                      placeholder="your@email.com"
                      className="pl-10 dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.email}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="signup-password" className="dark:text-[#E5EAE8]">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-[#B0B7B4] w-4 h-4" />
                    <Input
                      id="signup-password"
                      type="password"
                      value={signUpData.password}
                      onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                      placeholder="Create a password"
                      className="pl-10 dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                    />
                  </div>
                  {validationErrors.password && (
                    <p className="text-red-500 text-xs mt-1">{validationErrors.password}</p>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  disabled={loading}
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center text-gray-600 dark:text-[#B0B7B4]">
              <p className="text-xs">
                By joining, you agree to help build a more sustainable community through material sharing.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}