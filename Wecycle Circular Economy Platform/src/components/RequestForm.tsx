import { useState, useEffect, useRef } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Badge } from './ui/badge'
import { Slider } from './ui/slider'
import { ImageWithFallback } from './figma/ImageWithFallback'
import { DatabaseErrorAlert } from './DatabaseErrorAlert'
import { useAuth } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'
import { requestService } from '../services/requestService'
import { uploadService } from '../services/uploadService'
import { categories, findSimilarItems } from '../data/mockData'
import { 
  ArrowLeft,
  Upload, 
  MapPin, 
  Calendar, 
  Lightbulb, 
  Search,
  Eye,
  X,
  AlertCircle,
  Clock,
  IndianRupee,
  User,
  MessageSquare,
  LogIn,
  UserPlus
} from 'lucide-react'
import { toast } from 'sonner'

interface RequestFormProps {
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

export function RequestForm({ onBack, onDatabaseError, isDemo, isGuest, onSignIn, onSignUp }: RequestFormProps) {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<any>(null)
  const [dragActive, setDragActive] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    location: '',
    notes: '',
    duration: 7,
    urgency: 'medium' as 'low' | 'medium' | 'high',
    referenceImage: '',
    budgetRange: [0, 5000] as [number, number],
    hasBudget: false
  })

  // Form validation state
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({})

  // Find similar items based on current form data
  const [similarItems, setSimilarItems] = useState<any[]>([])

  useEffect(() => {
    if (formData.category || formData.title) {
      const searchQuery = formData.title
      const similar = findSimilarItems(searchQuery, formData.category, 5)
      setSimilarItems(similar)
    } else {
      setSimilarItems([])
    }
  }, [formData.category, formData.title])

  // Validate form fields
  const validateForm = () => {
    const errors: {[key: string]: string} = {}
    
    if (!formData.title.trim()) {
      errors.title = 'Title is required'
    } else if (formData.title.length < 5) {
      errors.title = 'Title must be at least 5 characters'
    } else if (formData.title.length > 100) {
      errors.title = 'Title must be less than 100 characters'
    }
    
    if (!formData.description.trim()) {
      errors.description = 'Description is required'
    } else if (formData.description.length < 20) {
      errors.description = 'Description must be at least 20 characters'
    } else if (formData.description.length > 1000) {
      errors.description = 'Description must be less than 1000 characters'
    }
    
    if (!formData.category) {
      errors.category = 'Category is required'
    }
    
    if (!formData.location.trim()) {
      errors.location = 'Location is required'
    } else if (formData.location.length < 3) {
      errors.location = 'Location must be at least 3 characters'
    }

    if (formData.hasBudget && formData.budgetRange[0] >= formData.budgetRange[1]) {
      errors.budget = 'Minimum budget must be less than maximum budget'
    }
    
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    
    // Validate file
    const maxSize = 3 * 1024 * 1024 // 3MB
    if (file.size > maxSize) {
      toast.error('Image size must be less than 3MB')
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, and WebP images are allowed')
      return
    }

    setImageUploading(true)

    try {
      if (isSupabaseConfigured && user) {
        // Upload to Supabase storage
        const imageUrl = await uploadService.uploadReferenceImage(file)
        setFormData(prev => ({ ...prev, referenceImage: imageUrl }))
        toast.success('Reference image uploaded successfully')
      } else {
        // Demo mode - convert to data URL
        const reader = new FileReader()
        reader.onload = (e) => {
          if (e.target?.result) {
            setFormData(prev => ({ ...prev, referenceImage: e.target!.result as string }))
            toast.success('Reference image added (demo mode)')
          }
        }
        reader.readAsDataURL(file)
      }
    } catch (error: any) {
      console.error('Error uploading image:', error)
      toast.error(error.message || 'Failed to upload image')
    } finally {
      setImageUploading(false)
    }
  }

  const removeImage = async () => {
    if (formData.referenceImage && formData.referenceImage.startsWith('http') && isSupabaseConfigured && user) {
      try {
        await uploadService.deleteImage(formData.referenceImage, 'reference_images')
      } catch (error) {
        console.warn('Failed to delete image from storage:', error)
      }
    }
    setFormData(prev => ({ ...prev, referenceImage: '' }))
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files)
    }
  }

  const calculateExpiryDate = () => {
    return new Date(Date.now() + formData.duration * 24 * 60 * 60 * 1000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      toast.error('Please fix the errors before submitting')
      return
    }

    if (!isSupabaseConfigured || !user) {
      toast.success('Demo mode: Request would be posted with full Supabase connection')
      onBack()
      return
    }

    try {
      setLoading(true)
      setLocalError(null)

      const expiryDate = calculateExpiryDate()
      
      const requestData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        location: formData.location.trim(),
        reference_image: formData.referenceImage || undefined,
        notes: formData.notes.trim() || undefined,
        expires_at: expiryDate.toISOString(),
        urgency: formData.urgency,
        budget_range: formData.hasBudget ? {
          min: formData.budgetRange[0],
          max: formData.budgetRange[1]
        } : undefined
      }

      console.log('Submitting request data:', requestData)
      
      await requestService.createRequest(requestData)
      toast.success('Request posted successfully!')
      onBack()
    } catch (error: any) {
      console.error('Error posting request:', error)
      
      // Handle specific database errors
      if (error.message.includes('Database access denied') || 
          error.message.includes('Row Level Security') ||
          error.message.includes('Missing required data') ||
          error?.code === '42501' || 
          error?.code === '23502') {
        setLocalError(error)
        onDatabaseError?.(error, 'request creation')
      } else {
        toast.error('Failed to post request. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const urgencyColors = {
    low: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    high: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
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
          <h1 className="text-green-700 dark:text-green-400 font-semibold">Post a Request</h1>
          <p className="text-gray-600 dark:text-[#B0B7B4] mt-2">Let the community know what materials you need</p>
        </div>

        {/* Local Database Error Alert */}
        {localError && !isGuest && (
          <DatabaseErrorAlert
            error={localError}
            context="request form"
            onRetry={() => window.location.reload()}
            onClose={() => setLocalError(null)}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  Request Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Title */}
                  <div>
                    <Label htmlFor="title" className="dark:text-[#E5EAE8]">What are you looking for? *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      placeholder="e.g., Bicycle repair tools, Oak wood planks, Arduino components"
                      className={`dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4] ${
                        validationErrors.title ? 'border-red-500' : ''
                      }`}
                    />
                    {validationErrors.title && (
                      <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {validationErrors.title}
                      </p>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <Label htmlFor="description" className="dark:text-[#E5EAE8]">Description *</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="Describe what you need, condition requirements, intended use, specifications..."
                      rows={4}
                      className={`dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4] ${
                        validationErrors.description ? 'border-red-500' : ''
                      }`}
                    />
                    <div className="flex justify-between items-center mt-1">
                      {validationErrors.description ? (
                        <p className="text-red-500 text-sm flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          {validationErrors.description}
                        </p>
                      ) : (
                        <div />
                      )}
                      <p className="text-xs text-gray-500 dark:text-[#B0B7B4]">
                        {formData.description.length}/1000
                      </p>
                    </div>
                  </div>

                  {/* Category and Location */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="category" className="dark:text-[#E5EAE8]">Category *</Label>
                      <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                        <SelectTrigger className={`dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] ${
                          validationErrors.category ? 'border-red-500' : ''
                        }`}>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-[#122821] dark:border-[#1C3A30]">
                          {categories.map(category => (
                            <SelectItem key={category} value={category} className="dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]">{category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {validationErrors.category && (
                        <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          {validationErrors.category}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="location" className="dark:text-[#E5EAE8]">Location *</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-[#B0B7B4] w-4 h-4" />
                        <Input
                          id="location"
                          value={formData.location}
                          onChange={(e) => handleInputChange('location', e.target.value)}
                          placeholder="City, State"
                          className={`pl-10 dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4] ${
                            validationErrors.location ? 'border-red-500' : ''
                          }`}
                        />
                      </div>
                      {validationErrors.location && (
                        <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                          <AlertCircle className="w-4 h-4" />
                          {validationErrors.location}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Duration and Urgency */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="duration" className="dark:text-[#E5EAE8]">Duration: {formData.duration} days</Label>
                      <Slider
                        value={[formData.duration]}
                        onValueChange={(value) => handleInputChange('duration', value[0])}
                        max={30}
                        min={1}
                        step={1}
                        className="mt-2"
                      />
                      <div className="flex justify-between text-xs text-gray-500 dark:text-[#B0B7B4] mt-1">
                        <span>1 day</span>
                        <span>Expires: {calculateExpiryDate().toLocaleDateString()}</span>
                        <span>30 days</span>
                      </div>
                    </div>

                    <div>
                      <Label className="dark:text-[#E5EAE8]">Urgency</Label>
                      <div className="flex gap-2 mt-2">
                        {(['low', 'medium', 'high'] as const).map((level) => (
                          <Button
                            key={level}
                            type="button"
                            variant={formData.urgency === level ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleInputChange('urgency', level)}
                            className={`flex-1 ${
                              formData.urgency === level 
                                ? urgencyColors[level]
                                : 'dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]'
                            }`}
                          >
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Budget Range */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="dark:text-[#E5EAE8]">Budget Range (Optional)</Label>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="hasBudget" className="text-sm dark:text-[#E5EAE8]">Set budget</Label>
                        <input
                          type="checkbox"
                          id="hasBudget"
                          checked={formData.hasBudget}
                          onChange={(e) => handleInputChange('hasBudget', e.target.checked)}
                          className="rounded"
                        />
                      </div>
                    </div>
                    
                    {formData.hasBudget && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <IndianRupee className="w-4 h-4 text-gray-500" />
                          <span className="text-sm dark:text-[#E5EAE8]">
                            ₹{formData.budgetRange[0].toLocaleString('en-IN')} - ₹{formData.budgetRange[1].toLocaleString('en-IN')}
                          </span>
                        </div>
                        <Slider
                          value={formData.budgetRange}
                          onValueChange={(value) => handleInputChange('budgetRange', value as [number, number])}
                          max={50000}
                          min={0}
                          step={100}
                          className="mt-2"
                        />
                        <div className="flex justify-between text-xs text-gray-500 dark:text-[#B0B7B4] mt-1">
                          <span>Free</span>
                          <span>₹50,000</span>
                        </div>
                        {validationErrors.budget && (
                          <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            {validationErrors.budget}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reference Image */}
                  <div>
                    <Label className="dark:text-[#E5EAE8]">Reference Image (Optional)</Label>
                    <p className="text-sm text-gray-600 dark:text-[#B0B7B4] mb-3">Upload an example or reference image to help others understand what you need</p>
                    
                    {formData.referenceImage ? (
                      <div className="relative inline-block">
                        <ImageWithFallback
                          src={formData.referenceImage}
                          alt="Reference"
                          className="w-48 h-32 object-cover rounded-lg border-2 border-gray-200 dark:border-[#1C3A30]"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={removeImage}
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full p-0"
                          disabled={imageUploading}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                          dragActive 
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                            : 'border-gray-300 dark:border-[#1C3A30] hover:border-green-500'
                        } ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => !imageUploading && fileInputRef.current?.click()}
                      >
                        {imageUploading ? (
                          <div className="flex flex-col items-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mb-2"></div>
                            <p className="text-gray-600 dark:text-[#B0B7B4]">Uploading image...</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 text-gray-400 dark:text-[#B0B7B4] mx-auto mb-2" />
                            <p className="text-gray-600 dark:text-[#B0B7B4] mb-2">Drag reference image here or click to upload</p>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageUpload(e.target.files)}
                              className="hidden"
                            />
                            <Button type="button" variant="outline" size="sm" className="dark:border-[#1C3A30] dark:text-[#E5EAE8]">
                              Choose File
                            </Button>
                            <p className="text-xs text-gray-500 dark:text-[#B0B7B4] mt-2">
                              Max 3MB • JPEG, PNG, WebP
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <Label htmlFor="notes" className="dark:text-[#E5EAE8]">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      placeholder="Any specific requirements, pickup preferences, quality expectations, or other details..."
                      rows={3}
                      className="dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex gap-3 pt-4">
                    <Button 
                      type="submit" 
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
                      disabled={loading || !!localError || imageUploading}
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Posting...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Post Request
                        </>
                      )}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={onBack}
                      className="dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#122821]"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Request Preview */}
            <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
                  <Eye className="w-5 h-5 text-purple-600" />
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h4 className="font-medium dark:text-[#E5EAE8]">
                    {formData.title || 'Your request title'}
                  </h4>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className="text-xs">
                      {formData.category || 'Category'}
                    </Badge>
                    <Badge className={`text-xs ${urgencyColors[formData.urgency]}`}>
                      {formData.urgency}
                    </Badge>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-[#B0B7B4] line-clamp-3">
                  {formData.description || 'Your detailed description will appear here...'}
                </p>
                
                <div className="flex items-center text-xs text-gray-500 dark:text-[#B0B7B4] gap-4">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{formData.location || 'Location'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formData.duration}d left</span>
                  </div>
                </div>

                {formData.hasBudget && (
                  <div className="text-xs text-green-600 dark:text-green-400">
                    Budget: ₹{formData.budgetRange[0].toLocaleString('en-IN')} - ₹{formData.budgetRange[1].toLocaleString('en-IN')}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Similar Available Items */}
            {similarItems.length > 0 && (
              <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
                    <Search className="w-5 h-5 text-green-500" />
                    Similar Items Available
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4] mb-4">
                    These items might match what you're looking for:
                  </p>
                  <div className="space-y-3">
                    {similarItems.slice(0, 3).map((upload) => (
                      <div key={upload.id} className="p-3 bg-green-50 dark:bg-[#145C45] rounded-lg border border-green-200 dark:border-[#1C3A30]">
                        <div className="flex gap-3">
                          {upload.images?.[0] && (
                            <ImageWithFallback
                              src={upload.images[0]}
                              alt={upload.title}
                              className="w-12 h-12 object-cover rounded flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-green-900 dark:text-green-100 mb-1 truncate">{upload.title}</h4>
                            <p className="text-xs text-green-700 dark:text-green-200 mb-2">{upload.user_name} • {upload.location}</p>
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs border-green-600 text-green-700 dark:border-green-400 dark:text-green-300">
                                {upload.price === 0 ? 'Free' : `₹${upload.price}`}
                              </Badge>
                              <Button size="sm" variant="outline" className="text-xs h-6 px-2 text-green-600 border-green-600 hover:bg-green-600 hover:text-white dark:text-green-400 dark:border-green-400">
                                <Eye className="w-3 h-3 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {similarItems.length > 3 && (
                    <Button variant="ghost" size="sm" className="w-full mt-3 text-green-600 dark:text-green-400">
                      View {similarItems.length - 3} more similar items
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Tips */}
            <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 dark:text-[#E5EAE8]">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  Request Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-600 dark:text-[#B0B7B4]">
                <p>• Be specific about what you need</p>
                <p>• Include intended use and requirements</p>
                <p>• Set appropriate urgency level</p>
                <p>• Upload reference images when helpful</p>
                <p>• Respond promptly to offers</p>
                <p>• Consider alternative materials</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {(isDemo || (!isSupabaseConfigured && !isGuest)) && (
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
            <CardContent className="p-4">
              <p className="text-orange-800 dark:text-orange-200 text-sm">
                <strong>Demo Mode:</strong> Requests won't be saved without a Supabase connection. 
                Connect your database to enable full request functionality.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Authentication Overlay for Guest Users */}
      {isGuest && onSignIn && onSignUp && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0B1F17]/80 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 shadow-xl border-2 border-blue-200 dark:border-blue-700">
            <CardHeader className="text-center">
              <MessageSquare className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <CardTitle className="text-blue-700 dark:text-blue-400">
                Post Your Request
              </CardTitle>
              <p className="text-gray-600 dark:text-[#B0B7B4] text-sm">
                Join Wecycle to post requests, get responses from community members, and find the materials you need
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={onSignUp}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Sign Up to Post Request
              </Button>
              <Button 
                onClick={onSignIn}
                variant="outline"
                className="w-full border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950 font-medium"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign In to Your Account
              </Button>
              <div className="text-center text-xs text-gray-500 dark:text-[#B0B7B4]">
                Connect with community members who can help
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}