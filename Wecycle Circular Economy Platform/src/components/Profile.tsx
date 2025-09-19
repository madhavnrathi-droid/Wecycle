import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Switch } from './ui/switch'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { ImageWithFallback } from './figma/ImageWithFallback'
import { DatabaseErrorAlert } from './DatabaseErrorAlert'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import { profileService } from '../services/profileService'
import { isSupabaseConfigured } from '../lib/supabase'
import { 
  User, 
  Mail, 
  Phone, 
  Camera, 
  Settings, 
  Moon, 
  Sun, 
  Lock,
  MessageSquare,
  Send,
  MapPin,
  Edit,
  Save,
  X,
  FileText,
  AlertTriangle,
  RefreshCw,
  Shield,
  ExternalLink,
  LogOut
} from 'lucide-react'
import { toast } from 'sonner'

interface ProfileProps {
  onDatabaseError?: (error: any, context: string) => void
}

export function Profile({ onDatabaseError }: ProfileProps) {
  const { user, updatePassword, signOut } = useAuth()
  const { isDark, toggle: toggleDarkMode, theme, setTheme } = useDarkMode()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [rlsError, setRlsError] = useState<string | null>(null)
  const [localError, setLocalError] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    location: '',
    bio: ''
  })
  
  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  
  // Feedback form state
  const [feedback, setFeedback] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  useEffect(() => {
    if (user && isSupabaseConfigured) {
      loadProfile()
    } else {
      // Demo mode profile
      const demoProfile = {
        id: 'demo-user',
        name: 'Demo User',
        email: 'demo@wecycle.app',
        phone: '+1 (555) 123-4567',
        location: 'Campus Library',
        bio: 'Passionate about sustainability and circular economy. Helping build a greener future through community sharing.',
        avatar_url: null,
        created_at: new Date().toISOString()
      }
      setProfile(demoProfile)
      setFormData({
        name: demoProfile.name,
        phone: demoProfile.phone,
        email: demoProfile.email,
        location: demoProfile.location,
        bio: demoProfile.bio
      })
      setLoading(false)
    }
  }, [user])

  const loadProfile = async () => {
    if (!user || !isSupabaseConfigured) return
    
    try {
      setLoading(true)
      setAuthError(null)
      setRlsError(null)
      setLocalError(null)
      
      const data = await profileService.getProfile(user.id)
      setProfile(data)
      
      // Check if this is a temporary profile due to RLS issues
      if (data?._rlsError) {
        setRlsError('Database permissions not configured. Profile changes won\'t be saved until Row Level Security policies are set up.')
      }
      
      if (data) {
        setFormData({
          name: data.name || '',
          phone: data.phone || '',
          email: data.email || user.email || '',
          location: data.location || '',
          bio: data.bio || ''
        })
      }
    } catch (error: any) {
      console.error('Error loading profile:', error)
      
      if (error.message.includes('Database access denied') || error.message.includes('Row Level Security')) {
        setRlsError('Database permissions not configured properly. Please set up Row Level Security policies to enable profile functionality.')
        setLocalError(error)
        onDatabaseError?.(error, 'profile load')
        
        // Create a temporary profile for display
        const tempProfile = {
          id: user.id,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          phone: '',
          location: user.user_metadata?.location || '',
          bio: '',
          avatar_url: null,
          created_at: new Date().toISOString(),
          _isTemporary: true,
          _rlsError: true
        }
        setProfile(tempProfile)
        setFormData({
          name: tempProfile.name,
          phone: tempProfile.phone,
          email: tempProfile.email,
          location: tempProfile.location,
          bio: tempProfile.bio
        })
      } else if (error.message.includes('Authentication required') || error.message.includes('Access denied')) {
        setAuthError('Authentication issue detected. Please try signing out and back in.')
        toast.error('Authentication required. Please sign in again.')
      } else if (error.message.includes('Network connection error')) {
        setAuthError('Network connection error. Please check your internet connection.')
        toast.error('Connection failed. Please check your internet connection.')
      } else {
        setAuthError('Failed to load profile. Please try again.')
        toast.error('Failed to load profile')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!isSupabaseConfigured) {
      toast.error('Connect Supabase to save profile changes')
      return
    }
    
    if (!user) {
      toast.error('Please sign in to save profile changes')
      return
    }

    if (profile?._rlsError) {
      toast.error('Cannot save profile. Please set up database permissions first.')
      return
    }
    
    try {
      setAuthError(null)
      setRlsError(null)
      setLocalError(null)
      
      await profileService.updateProfile(user.id, formData)
      setProfile({ ...profile, ...formData })
      setEditing(false)
      toast.success('Profile updated successfully')
    } catch (error: any) {
      console.error('Error updating profile:', error)
      
      if (error.message.includes('Database access denied') || error.message.includes('Row Level Security')) {
        setRlsError('Cannot save profile changes. Database permissions need to be configured.')
        setLocalError(error)
        onDatabaseError?.(error, 'profile update')
        toast.error('Database permissions required to save changes')
      } else if (error.message.includes('Authentication required') || error.message.includes('Access denied')) {
        setAuthError('Authentication issue detected. Please try signing out and back in.')
        toast.error('Authentication required. Please sign in again.')
      } else {
        toast.error('Failed to update profile')
      }
    }
  }

  const handlePasswordChange = async () => {
    if (!isSupabaseConfigured) {
      toast.error('Connect Supabase to change password')
      return
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    
    if (passwordData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    
    try {
      setAuthError(null)
      await updatePassword(passwordData.newPassword)
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setShowPasswordChange(false)
      toast.success('Password updated successfully')
    } catch (error: any) {
      console.error('Error updating password:', error)
      
      if (error.message.includes('Authentication required') || error.message.includes('Access denied')) {
        setAuthError('Authentication issue detected. Please try signing out and back in.')
        toast.error('Authentication required. Please sign in again.')
      } else {
        toast.error('Failed to update password')
      }
    }
  }

  const handleFeedbackSubmit = async () => {
    if (!feedback.trim()) {
      toast.error('Please enter your feedback')
      return
    }
    
    try {
      setFeedbackSubmitting(true)
      
      if (isSupabaseConfigured) {
        // Here you would normally submit to your feedback service
        // For now, we'll just simulate the submission
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      setFeedback('')
      toast.success('Thank you for your feedback! We appreciate your input.')
    } catch (error) {
      console.error('Error submitting feedback:', error)
      toast.error('Failed to submit feedback')
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
    } catch (error) {
      console.error('Error signing out:', error)
      toast.error('Failed to sign out')
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Local Database Error Alert */}
      {localError && (
        <DatabaseErrorAlert
          error={localError}
          context="profile management"
          onRetry={loadProfile}
          onClose={() => setLocalError(null)}
        />
      )}

      {/* Authentication Error Alert */}
      {authError && !localError && (
        <Alert className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            {authError}
            <div className="flex gap-2 mt-3">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={loadProfile}
                className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleSignOut}
                className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
              >
                Sign Out & Back In
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Profile Header */}
      <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
              <User className="w-5 h-5 text-green-600" />
              Profile
              {profile?._isTemporary && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  Temporary
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              onClick={() => editing ? setEditing(false) : setEditing(true)}
              className="flex items-center gap-2 dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]"
              disabled={!!authError}
            >
              {editing ? <X className="w-4 h-4" /> : <Edit className="w-4 h-4" />}
              {editing ? 'Cancel' : 'Edit'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Picture */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                {profile?.avatar_url ? (
                  <ImageWithFallback
                    src={profile.avatar_url}
                    alt="Profile"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-green-600" />
                )}
              </div>
              {editing && !profile?._rlsError && (
                <Button
                  size="sm"
                  variant="outline"
                  className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0 dark:border-[#1C3A30] dark:hover:bg-[#1C3A30]"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div>
              <h2 className="text-xl dark:text-[#E5EAE8]">{profile?.name || 'User'}</h2>
              <p className="text-gray-600 dark:text-[#B0B7B4]">
                Member since {new Date(profile?.created_at || Date.now()).toLocaleDateString()}
              </p>
              {profile?._isTemporary && (
                <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                  Profile data is temporary until database is configured
                </p>
              )}
            </div>
          </div>

          {/* Profile Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2 dark:text-[#E5EAE8]">
                <User className="w-4 h-4" />
                Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={!editing || !!authError}
                className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2 dark:text-[#E5EAE8]">
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={!editing || !!authError}
                className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2 dark:text-[#E5EAE8]">
                <Phone className="w-4 h-4" />
                Phone
              </Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                disabled={!editing || !!authError}
                className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-2 dark:text-[#E5EAE8]">
                <MapPin className="w-4 h-4" />
                Location
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                disabled={!editing || !!authError}
                placeholder="e.g., Campus Library, Building A"
                className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
              />
            </div>
          </div>

          {/* Bio Section */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="flex items-center gap-2 dark:text-[#E5EAE8]">
              <FileText className="w-4 h-4" />
              Bio
            </Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              disabled={!editing || !!authError}
              placeholder="Tell others about yourself and your sustainability interests..."
              rows={3}
              className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
            />
          </div>

          {editing && !authError && !profile?._rlsError && (
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setEditing(false)}
                className="dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]"
              >
                Cancel
              </Button>
              <Button onClick={handleSaveProfile} className="bg-green-600 hover:bg-green-700">
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          )}

          {editing && profile?._rlsError && (
            <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
              <Shield className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800 dark:text-orange-200 text-sm">
                Profile changes cannot be saved until database permissions are configured. Please set up Row Level Security policies first.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Account Settings */}
      <Card className="shadow-lg dark:bg-[#122821] dark:border-[#1C3A30]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
            <Settings className="w-5 h-5 text-blue-600" />
            Account Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Dark Mode Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1C3A30] rounded-lg">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="w-5 h-5 text-blue-600" /> : <Sun className="w-5 h-5 text-yellow-600" />}
              <div>
                <Label className="dark:text-[#E5EAE8]">Dark Mode</Label>
                <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">
                  Currently: {theme === 'system' ? 'Auto (System)' : theme === 'dark' ? 'Dark' : 'Light'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme('system')}
                className={`${
                  theme === 'system' 
                    ? 'bg-blue-50 border-blue-200 dark:bg-[#145C45] dark:border-[#145C45]' 
                    : 'dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#145C45]'
                }`}
              >
                Auto
              </Button>
              <Switch
                checked={isDark}
                onCheckedChange={toggleDarkMode}
              />
            </div>
          </div>

          {/* Password Change */}
          <div className="p-4 bg-gray-50 dark:bg-[#1C3A30] rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-red-600" />
                <div>
                  <Label className="dark:text-[#E5EAE8]">Password</Label>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Change your account password</p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowPasswordChange(!showPasswordChange)}
                className="dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#145C45]"
                disabled={!!authError}
              >
                {showPasswordChange ? 'Cancel' : 'Change'}
              </Button>
            </div>

            {showPasswordChange && !authError && (
              <div className="space-y-3 mt-4 pt-4 border-t dark:border-[#1C3A30]">
                <Input
                  type="password"
                  placeholder="Current Password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  className="dark:bg-[#0B1F17] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                />
                <Input
                  type="password"
                  placeholder="New Password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="dark:bg-[#0B1F17] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                />
                <Input
                  type="password"
                  placeholder="Confirm New Password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="dark:bg-[#0B1F17] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                />
                <Button
                  onClick={handlePasswordChange}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                >
                  Update Password
                </Button>
              </div>
            )}
          </div>

          {/* Sign Out Section */}
          <div className="p-4 bg-gray-50 dark:bg-[#1C3A30] rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-red-600" />
                <div>
                  <Label className="dark:text-[#E5EAE8]">Sign Out</Label>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Sign out of your account</p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback Form */}
      <Card className="shadow-lg dark:bg-[#122821] dark:border-[#1C3A30]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
            <MessageSquare className="w-5 h-5 text-purple-600" />
            Send Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">
            Help us improve Wecycle! Share your suggestions, report issues, or tell us what you love about the platform.
          </p>
          
          <Textarea
            placeholder="Your feedback, suggestions, or ideas..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            className="resize-none dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
          />
          
          <div className="flex justify-end">
            <Button
              onClick={handleFeedbackSubmit}
              disabled={!feedback.trim() || feedbackSubmitting}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {feedbackSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Feedback
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!isSupabaseConfigured && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
          <CardContent className="p-4">
            <p className="text-orange-800 dark:text-orange-200 text-sm">
              <strong>Demo Mode:</strong> Profile changes won't be saved without a Supabase connection. 
              Connect your database to enable full profile functionality.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}