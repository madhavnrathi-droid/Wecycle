import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Slider } from './ui/slider'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'
import { ImageWithFallback } from './figma/ImageWithFallback'
import { ImagePreviewModal } from './ImagePreviewModal'
import { DatabaseErrorAlert } from './DatabaseErrorAlert'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'
import { uploadService } from '../services/uploadService'
import { profileService } from '../services/profileService'
import { categories } from '../data/mockData'
import { 
  ArrowLeft, 
  Upload, 
  X, 
  Plus, 
  MapPin, 
  Calendar, 
  IndianRupee,
  User,
  Package,
  Eye,
  Info,
  Phone,
  Mail,
  LogIn,
  UserPlus
} from 'lucide-react'
import { toast } from 'sonner'

interface DistributeFormProps {
  onBack: () => void
  onDatabaseError?: (error: any, context: string) => void
  isDemo?: boolean
  isGuest?: boolean
  onSignIn?: () => void
  onSignUp?: () => void
}

// Helper function to convert a Base64 string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
  const arr = dataurl.split(',')
  const mimeMatch = arr[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : ''
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while(n--){
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, {type:mime})
}

export function DistributeForm({ onBack, onDatabaseError, isDemo, isGuest, onSignIn, onSignUp }: DistributeFormProps) {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [previewModal, setPreviewModal] = useState({ isOpen: false, index: 0 })
  const [localError, setLocalError] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    materialType: '',
    title: '',
    category: '',
    location: '',
    description: '',
    duration: 7,
    price: [0],
    images: [] as string[],
    contactNote: '',
    showPhone: true,
    showEmail: true
  })

  // Load user profile for contact info display
  useEffect(() => {
    const fetchProfile = async () => {
      if (user && isSupabaseConfigured) {
        try {
          setLocalError(null)
          const profileData = await profileService.getProfile(user.id)
          setProfile(profileData)
        } catch (error: any) {
          console.error('Error fetching profile:', error)
          
          // Handle specific database errors
          if (error.message.includes('Database access denied') || 
              error.message.includes('Row Level Security')) {
            setLocalError(error)
            onDatabaseError?.(error, 'profile fetch')
          } else {
            toast.error('Failed to load profile information')
          }
        }
      }
    }
    fetchProfile()
  }, [user, onDatabaseError])

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const maxFiles = 5
    const maxFileSize = 5 * 1024 * 1024 // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    const validFiles = Array.from(files).filter(file => {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name} is not a supported image format`)
        return false
      }
      if (file.size > maxFileSize) {
        toast.error(`${file.name} is too large. Maximum size is 5MB`)
        return false
      }
      return true
    }).slice(0, maxFiles - formData.images.length)

    if (validFiles.length === 0) return

    validFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) {
          setFormData(prev => ({
            ...prev,
            images: [...prev.images, e.target!.result as string].slice(0, maxFiles)
          }))
        }
      }
      reader.readAsDataURL(file)
    })

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check if form is valid
    if (!formData.materialType || !formData.title || !formData.category || !formData.description || !formData.location) {
      toast.error('Please fill in all required fields')
      return
    }

    if (formData.images.length === 0) {
      toast.error('Please upload at least one image')
      return
    }

    if (!isSupabaseConfigured || !user) {
      toast.success('Demo mode: Material would be uploaded with full Supabase connection')
      onBack()
      return
    }

    try {
      setLoading(true)
      setLocalError(null)

      // Step 1: Upload each image to Supabase Storage
      const uploadedImageUrls = []
      for (const imageDataUrl of formData.images) {
        const file = dataURLtoFile(imageDataUrl, `${user.id}-${Date.now()}.png`)
        const imageUrl = await uploadService.uploadImage(file)
        uploadedImageUrls.push(imageUrl)
      }

      // Step 2: Create contact visibility settings
      let contactInfo = ''
      if (formData.showEmail && (profile?.email || user?.email)) {
        contactInfo += `Email: ${profile?.email || user?.email}\n`
      }
      if (formData.showPhone && profile?.phone) {
        contactInfo += `Phone: ${profile.phone}\n`
      }
      if (formData.contactNote) {
        contactInfo += `\nContact Notes: ${formData.contactNote}`
      }

      // Step 3: Create the upload data
      const uploadData = {
        title: `${formData.materialType} - ${formData.title}`,
        description: formData.description + (contactInfo ? `\n\nContact Information:\n${contactInfo}` : ''),
        category: formData.category,
        location: formData.location,
        images: uploadedImageUrls,
        price: formData.price[0] > 0 ? formData.price[0] : undefined,
        expires_at: new Date(Date.now() + formData.duration * 24 * 60 * 60 * 1000).toISOString(),
        max_duration: formData.duration,
        contact_settings: {
          showPhone: formData.showPhone,
          showEmail: formData.showEmail
        }
      }
      
      console.log('Submitting upload data:', uploadData)
      
      await uploadService.createUpload(uploadData)
      toast.success('Material uploaded successfully!')
      onBack()
    } catch (error: any) {
      console.error('Error uploading material:', error)
      
      // Handle specific database errors
      if (error.message.includes('Database access denied') || 
          error.message.includes('Row Level Security') ||
          error.message.includes('Missing required data') ||
          error?.code === '42501' || 
          error?.code === '23502') {
        setLocalError(error)
        onDatabaseError?.(error, 'material upload')
      } else {
        toast.error('Failed to upload material. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      {/* Content Layer */}
      <div className={`max-w-4xl mx-auto p-6 space-y-6 ${isGuest ? 'filter blur-[1px] pointer-events-none' : ''}`}>
        {/* Header */}
        <div>
          <Button 
            variant="ghost" 
            onClick={onBack}
            className="mb-4 text-gray-600 dark:text-[#B0B7B4] hover:text-gray-900 dark:hover:text-[#E5EAE8]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          <h1 className="text-green-700 dark:text-green-400 font-semibold">Share Materials</h1>
          <p className="text-gray-600 dark:text-[#B0B7B4] mt-2">Share materials you no longer need with the community</p>
        </div>

        {/* Local Database Error Alert */}
        {localError && !isGuest && (
          <DatabaseErrorAlert
            error={localError}
            context="upload form"
            onRetry={() => window.location.reload()}
            onClose={() => setLocalError(null)}
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Material Information */}
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
                <Package className="w-5 h-5 text-green-600" />
                Material Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="materialType" className="dark:text-[#E5EAE8]">Material Type *</Label>
                  <Input
                    id="materialType"
                    placeholder="e.g., Textbook, Bicycle, Electronics"
                    value={formData.materialType}
                    onChange={(e) => setFormData({ ...formData, materialType: e.target.value })}
                    required
                    className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                  />
                </div>
                
                <div>
                  <Label htmlFor="title" className="dark:text-[#E5EAE8]">Material Name *</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Physics Textbook, Mountain Bike"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                    className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category" className="dark:text-[#E5EAE8]">Category *</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8]">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-[#122821] dark:border-[#1C3A30]">
                      {categories.map(category => (
                        <SelectItem key={category} value={category} className="dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]">{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="location" className="dark:text-[#E5EAE8]">Location *</Label>
                  <Input
                    id="location"
                    placeholder="e.g., Campus Library, Building A"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                    className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description" className="dark:text-[#E5EAE8]">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the condition, any defects, usage history, etc."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  required
                  className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Duration and Price */}
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
                <Calendar className="w-5 h-5 text-blue-600" />
                Availability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="duration" className="dark:text-[#E5EAE8]">Duration (days): {formData.duration}</Label>
                <Slider
                  value={[formData.duration]}
                  onValueChange={(value) => setFormData({ ...formData, duration: value[0] })}
                  max={30}
                  min={1}
                  step={1}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-[#B0B7B4] mt-1">
                  <span>1 day</span>
                  <span>30 days</span>
                </div>
              </div>

              <div>
                <Label htmlFor="price" className="flex items-center gap-2 dark:text-[#E5EAE8]">
                  <IndianRupee className="w-4 h-4" />
                  Price (₹): {formData.price[0] === 0 ? 'Free' : `₹${formData.price[0].toLocaleString()}`}
                </Label>
                <Slider
                  value={formData.price}
                  onValueChange={(value) => setFormData({ ...formData, price: value })}
                  max={10000}
                  min={0}
                  step={50}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-[#B0B7B4] mt-1">
                  <span>Free</span>
                  <span>₹10,000</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Images */}
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
                <Upload className="w-5 h-5 text-purple-600" />
                Images
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="dark:text-[#E5EAE8]">Upload Images (Max 5) *</Label>
                <p className="text-sm text-gray-600 dark:text-[#B0B7B4] mb-3">
                  Add clear photos of your material. First image will be used as the main thumbnail.
                </p>
                
                {/* Image Thumbnails */}
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                    {formData.images.map((image, index) => (
                      <div key={index} className="relative group">
                        <div 
                          className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 dark:border-[#1C3A30] cursor-pointer hover:border-green-500 transition-colors"
                          onClick={() => setPreviewModal({ isOpen: true, index })}
                        >
                          <ImageWithFallback
                            src={image}
                            alt={`Upload ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        
                        {index === 0 && (
                          <Badge className="absolute -top-2 -left-2 bg-green-600 text-white text-xs">
                            Main
                          </Badge>
                        )}
                        
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full p-0"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Button */}
                {formData.images.length < 5 && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-32 border-dashed border-2 border-gray-300 dark:border-[#1C3A30] hover:border-green-500 dark:bg-[#1C3A30] dark:text-[#E5EAE8]"
                    >
                      <div className="text-center">
                        <Plus className="w-6 h-6 mx-auto mb-2 text-gray-400 dark:text-[#B0B7B4]" />
                        <span className="text-gray-600 dark:text-[#B0B7B4]">
                          Add Images ({formData.images.length}/5)
                        </span>
                        <p className="text-xs text-gray-500 dark:text-[#B0B7B4] mt-1">
                          JPG, PNG, WebP up to 5MB each
                        </p>
                      </div>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
                <User className="w-5 h-5 text-orange-600" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Contact Visibility Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#1C3A30] rounded-lg">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm dark:text-[#E5EAE8]">Show Email</span>
                  </div>
                  <Switch
                    checked={formData.showEmail}
                    onCheckedChange={(checked) => setFormData({ ...formData, showEmail: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#1C3A30] rounded-lg">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm dark:text-[#E5EAE8]">Show Phone</span>
                  </div>
                  <Switch
                    checked={formData.showPhone}
                    onCheckedChange={(checked) => setFormData({ ...formData, showPhone: checked })}
                  />
                </div>
              </div>
              
              <div className="p-3 bg-blue-50 dark:bg-[#145C45] rounded-lg border border-blue-200 dark:border-[#1C3A30]">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-blue-800 dark:text-blue-200 text-sm">
                      <strong>Contact Preview:</strong> Interested users will see the following contact information:
                    </p>
                    {profile && !profile._isTemporary && (
                      <div className="mt-2 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p>Profile: {profile.name || 'Not set'}</p>
                        {formData.showEmail && <p>Email: {profile.email || user?.email || 'Not set'}</p>}
                        {formData.showPhone && profile.phone && <p>Phone: {profile.phone}</p>}
                        {!formData.showEmail && !formData.showPhone && (
                          <p className="text-orange-600 dark:text-orange-400">⚠️ No contact methods enabled</p>
                        )}
                      </div>
                    )}
                    {profile?._isTemporary && (
                      <div className="mt-2 text-xs text-orange-700 dark:text-orange-300">
                        <p>Using temporary profile data due to database configuration.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div>
                <Label htmlFor="contactNote" className="dark:text-[#E5EAE8]">Additional Contact Notes (Optional)</Label>
                <Textarea
                  id="contactNote"
                  placeholder="e.g., Available weekdays after 5pm, prefer text messages, best way to contact, pickup instructions, etc."
                  value={formData.contactNote}
                  onChange={(e) => setFormData({ ...formData, contactNote: e.target.value })}
                  rows={3}
                  className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                />
                <p className="text-xs text-gray-500 dark:text-[#B0B7B4] mt-1">
                  Add any specific instructions or preferences for how interested users should contact you
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-6">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onBack}
              className="dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#122821]"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-green-600 hover:bg-green-700 text-white font-medium"
              disabled={loading || !!localError}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Share Material
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Image Preview Modal */}
        <ImagePreviewModal
          isOpen={previewModal.isOpen}
          onClose={() => setPreviewModal({ isOpen: false, index: 0 })}
          images={formData.images}
          currentIndex={previewModal.index}
          onIndexChange={(index) => setPreviewModal({ ...previewModal, index })}
          title="Material Images"
        />

        {(isDemo || (!isSupabaseConfigured && !isGuest)) && (
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
            <CardContent className="p-4">
              <p className="text-orange-800 dark:text-orange-200 text-sm">
                <strong>Demo Mode:</strong> Materials won't be saved without a Supabase connection. 
                Connect your database to enable full upload functionality.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Authentication Overlay for Guest Users */}
      {isGuest && onSignIn && onSignUp && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0B1F17]/80 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 shadow-xl border-2 border-green-200 dark:border-green-700">
            <CardHeader className="text-center">
              <Upload className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <CardTitle className="text-green-700 dark:text-green-400">
                Share Your Materials
              </CardTitle>
              <p className="text-gray-600 dark:text-[#B0B7B4] text-sm">
                Join Wecycle to share materials with your community, set pricing, manage listings, and help reduce waste
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={onSignUp}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Sign Up to Share Materials
              </Button>
              <Button 
                onClick={onSignIn}
                variant="outline"
                className="w-full border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950 font-medium"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign In to Your Account
              </Button>
              <div className="text-center text-xs text-gray-500 dark:text-[#B0B7B4]">
                Turn unused items into community resources
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}