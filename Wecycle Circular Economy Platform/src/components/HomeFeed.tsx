import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { HighlightButton } from './ui/highlight-button'
import { ImageWithFallback } from './figma/ImageWithFallback'
import { SearchWithPlaceholder } from './SearchWithPlaceholder'
import { ShareModal } from './ShareModal'
import { LoadingSpinner } from './LoadingSpinner'
import { useAuth } from '../hooks/useAuth'
import { uploadService } from '../services/uploadService'
import { requestService } from '../services/requestService'
import { savedItemsService } from '../services/notificationService'
import { isSupabaseConfigured } from '../lib/supabase'
import { categories, mockUploads, mockRequests } from '../data/mockData'
import { 
  Clock, 
  MapPin, 
  Heart, 
  MessageCircle, 
  Package, 
  AlertCircle, 
  Sparkles, 
  Database, 
  IndianRupee,
  Share,
  Trash2,
  EyeOff,
  Filter,
  TrendingUp
} from 'lucide-react'
import { toast } from 'sonner'

interface HomeFeedProps {
  onViewChange: (view: string) => void
  onDatabaseError?: (error: any, context: string) => void
}

export function HomeFeed({ onViewChange, onDatabaseError }: HomeFeedProps) {
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [uploads, setUploads] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set())
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'available' | 'requests'>('available')
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; title: string; itemId: string }>({
    isOpen: false,
    title: '',
    itemId: ''
  })
  
  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (user) {
      loadSavedItems()
    }
  }, [user])

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      handleSearch()
    }, 300)

    return () => clearTimeout(delayedSearch)
  }, [searchTerm, selectedCategory])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      if (!isSupabaseConfigured) {
        // Use mock data when Supabase is not configured
        setTimeout(() => {
          setUploads(mockUploads)
          setRequests(mockRequests)
          setLoading(false)
        }, 800)
        return
      }
      
      const [uploadsData, requestsData] = await Promise.all([
        uploadService.getActiveUploads(),
        requestService.getActiveRequests()
      ])
      
      setUploads(uploadsData || [])
      setRequests(requestsData || [])
    } catch (err: any) {
      setError('Failed to load materials. Please refresh the page.')
      console.error('Error loading data:', err)
      toast.error('Failed to load materials')
      onDatabaseError?.(err, 'home feed load')
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    try {
      setSearchLoading(true)
      
      if (!isSupabaseConfigured) {
        // Filter mock data when Supabase is not configured
        setTimeout(() => {
          const filteredUploads = mockUploads.filter(upload => 
            (searchTerm === '' || upload.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
             upload.description.toLowerCase().includes(searchTerm.toLowerCase())) &&
            (selectedCategory === 'all' || upload.category === selectedCategory)
          )
          const filteredRequests = mockRequests.filter(request => 
            (searchTerm === '' || request.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
             request.description.toLowerCase().includes(searchTerm.toLowerCase())) &&
            (selectedCategory === 'all' || request.category === selectedCategory)
          )
          
          setUploads(filteredUploads)
          setRequests(filteredRequests)
          setSearchLoading(false)
        }, 300)
        return
      }
      
      const [uploadsData, requestsData] = await Promise.all([
        uploadService.searchUploads(searchTerm, selectedCategory),
        requestService.searchRequests(searchTerm, selectedCategory)
      ])
      
      setUploads(uploadsData || [])
      setRequests(requestsData || [])
    } catch (err: any) {
      console.error('Error searching:', err)
      toast.error('Search failed. Please try again.')
      onDatabaseError?.(err, 'home feed search')
    } finally {
      setSearchLoading(false)
    }
  }

  const loadSavedItems = async () => {
    if (!user) return
    
    try {
      const savedData = await savedItemsService.getSavedItems(user.id)
      const savedIds = new Set(savedData?.map(item => item.upload_id) || [])
      setSavedItems(savedIds)
    } catch (err: any) {
      console.error('Error loading saved items:', err)
    }
  }

  const toggleSaved = async (itemId: string, itemTitle: string) => {
    if (!isSupabaseConfigured) {
      toast.error('Sign up to save items and get notifications')
      return
    }
    
    if (!user) {
      toast.error('Sign in to save items for later')
      return
    }

    try {
      if (savedItems.has(itemId)) {
        await savedItemsService.unsaveItem(itemId, user.id)
        setSavedItems(prev => {
          const newSet = new Set(prev)
          newSet.delete(itemId)
          return newSet
        })
        toast.success('Item removed from saved')
      } else {
        await savedItemsService.saveItem(itemId)
        setSavedItems(prev => new Set(prev).add(itemId))
        toast.success(`"${itemTitle}" saved for later`)
      }
    } catch (err: any) {
      console.error('Error toggling saved item:', err)
      toast.error('Failed to update saved items')
    }
  }

  const handleShare = (title: string, itemId: string) => {
    setShareModal({ isOpen: true, title, itemId })
  }

  const handleHideItem = (itemId: string, itemTitle: string) => {
    setHiddenItems(prev => new Set(prev).add(itemId))
    toast.success(`"${itemTitle}" hidden from feed`)
  }

  const handleDeleteItem = async (itemId: string, itemTitle: string, isRequest: boolean = false) => {
    if (!isSupabaseConfigured) {
      toast.error('Database connection required to delete items')
      return
    }

    try {
      if (isRequest) {
        await requestService.deleteRequest(itemId)
        setRequests(prev => prev.filter(item => item.id !== itemId))
      } else {
        await uploadService.deleteUpload(itemId)
        setUploads(prev => prev.filter(item => item.id !== itemId))
      }
      toast.success(`"${itemTitle}" deleted successfully`)
    } catch (error) {
      console.error('Error deleting item:', error)
      toast.error('Failed to delete item')
    }
  }

  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null
    
    const now = new Date()
    const expiry = new Date(expiresAt)
    const diff = expiry.getTime() - now.getTime()
    
    if (diff <= 0) return 'Expired'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) return `${days}d ${hours}h left`
    if (hours > 0) return `${hours}h left`
    return 'Expiring soon'
  }

  // Filter out hidden items
  const visibleUploads = uploads.filter(upload => !hiddenItems.has(upload.id))
  const visibleRequests = requests.filter(request => !hiddenItems.has(request.id))

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <LoadingSpinner className="h-12 w-12 mx-auto mb-4 text-green-600" />
            <h3 className="text-green-700 dark:text-green-400 mb-2 font-medium">Loading Materials</h3>
            <p className="text-gray-600 dark:text-[#B0B7B4]">Finding sustainable opportunities...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-red-700 dark:text-red-400 mb-2 font-medium">Something Went Wrong</h3>
          <p className="text-gray-600 dark:text-[#B0B7B4] mb-6">{error}</p>
          <Button onClick={loadData} className="bg-green-600 hover:bg-green-700 font-medium">
            <TrendingUp className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-6 h-6 text-green-600" />
          <h1 className="text-green-700 dark:text-green-400 font-semibold">Discover Sustainable Materials</h1>
        </div>
        <p className="text-gray-600 dark:text-[#B0B7B4] mb-6">
          Browse reusable materials from your community or post what you no longer need
        </p>
        
        {!isSupabaseConfigured && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 mb-6">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-800 dark:text-blue-200 text-sm font-medium">
                  <strong>Demo Mode:</strong> You're viewing Wecycle with sample data.
                </p>
                <p className="text-blue-700 dark:text-blue-300 text-xs mt-2">
                  Connect your Supabase project to access real-time updates, user authentication, and data persistence.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {user && isSupabaseConfigured && (
          <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800 mb-6">
            <p className="text-green-800 dark:text-green-200 text-sm">
              <strong>Welcome back!</strong> You have {savedItems.size} saved items and can now upload materials, post requests, and get real-time notifications.
            </p>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <SearchWithPlaceholder
          value={searchTerm}
          onChange={setSearchTerm}
          loading={searchLoading}
          className="flex-1"
          placeholder="Search materials, requests, or categories..."
        />
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full lg:w-48 dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Button 
          onClick={() => onViewChange('distribute')}
          className="bg-green-600 hover:bg-green-700 text-white font-medium"
        >
          <Package className="w-4 h-4 mr-2" />
          Share Materials
        </Button>
        <Button 
          onClick={() => onViewChange('acquire')}
          variant="outline"
          className="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 font-medium"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Post Request
        </Button>
      </div>

      {/* Feed Tabs with Highlight Animation */}
      <div className="w-full">
        <div className="flex w-full bg-gray-100 dark:bg-[#1C3A30] rounded-lg p-1 mb-8">
          <HighlightButton
            isActive={activeTab === 'available'}
            onClick={() => setActiveTab('available')}
            className="flex-1 p-3 text-center transition-colors duration-200 font-medium"
            activeClassName="text-green-700 dark:text-[#E5EAE8]"
            inactiveClassName="text-gray-600 dark:text-[#B0B7B4] hover:text-green-700 dark:hover:text-green-400"
          >
            Available Materials ({visibleUploads.length})
          </HighlightButton>
          <HighlightButton
            isActive={activeTab === 'requests'}
            onClick={() => setActiveTab('requests')}
            className="flex-1 p-3 text-center transition-colors duration-200 font-medium"
            activeClassName="text-green-700 dark:text-[#E5EAE8]"
            inactiveClassName="text-gray-600 dark:text-[#B0B7B4] hover:text-green-700 dark:hover:text-green-400"
          >
            Active Requests ({visibleRequests.length})
          </HighlightButton>
        </div>
        
        {/* Tab Content */}
        {activeTab === 'available' && (
          <div>
            {visibleUploads.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleUploads.map((upload) => (
                  <Card key={upload.id} className="overflow-hidden hover:shadow-lg transition-all duration-200 border-l-4 border-l-green-500 dark:bg-[#122821] dark:border-[#1C3A30]">
                    <div className="relative">
                      <ImageWithFallback
                        src={upload.images?.[0] || `https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=240&fit=crop`}
                        alt={upload.title}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute top-2 left-2 right-2 flex justify-between">
                        {upload.price && (
                          <Badge className="bg-green-600 text-white flex items-center gap-1 font-medium">
                            <IndianRupee className="w-3 h-3" />
                            {upload.price.toLocaleString('en-IN')}
                          </Badge>
                        )}
                        <div className="flex gap-1 ml-auto">
                          {(user || !isSupabaseConfigured) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleSaved(upload.id, upload.title)}
                              className={`${
                                savedItems.has(upload.id) ? 'text-red-500' : 'text-gray-400'
                              } bg-white/90 hover:bg-white shadow-sm`}
                            >
                              <Heart className={`w-4 h-4 ${savedItems.has(upload.id) ? 'fill-current' : ''}`} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShare(upload.title, upload.id)}
                            className="text-gray-400 bg-white/90 hover:bg-white shadow-sm"
                          >
                            <Share className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <h3 className="text-gray-900 dark:text-gray-100 line-clamp-2 pr-2 font-medium">{upload.title}</h3>
                        <Badge variant="secondary" className="shrink-0">
                          {upload.category}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-gray-600 dark:text-gray-400 line-clamp-2 text-sm">{upload.description}</p>
                      
                      <div className="flex items-center text-gray-500 gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{upload.location}</span>
                        </div>
                        {upload.expires_at && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{getTimeRemaining(upload.expires_at)}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                            <span className="text-xs text-green-700 dark:text-green-300 font-medium">
                              {upload.profiles?.name?.[0]?.toUpperCase() || upload.user_name?.[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {upload.profiles?.name || upload.user_name || 'Unknown User'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {user?.id === upload.user_id && (
                            <>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleHideItem(upload.id, upload.title)}
                                className="text-gray-500 hover:text-gray-700 p-1"
                              >
                                <EyeOff className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleDeleteItem(upload.id, upload.title)}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950 font-medium">
                            Contact
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">
                <Package className="w-16 h-16 mx-auto mb-6 text-gray-300" />
                <h3 className="mb-3 font-medium">No Materials Found</h3>
                <p className="mb-6">
                  {searchTerm || selectedCategory !== 'all' 
                    ? 'Try adjusting your search criteria to find more materials' 
                    : 'Be the first to share sustainable materials with the community!'}
                </p>
                <Button onClick={() => onViewChange('distribute')} className="bg-green-600 hover:bg-green-700 font-medium">
                  <Package className="w-4 h-4 mr-2" />
                  Share Something
                </Button>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'requests' && (
          <div>
            {visibleRequests.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleRequests.map((request) => (
                  <Card key={request.id} className="overflow-hidden hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500 dark:bg-[#122821] dark:border-[#1C3A30]">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <h3 className="text-gray-900 dark:text-gray-100 line-clamp-2 pr-2 font-medium">{request.title}</h3>
                        <Badge variant="outline" className="shrink-0 border-blue-200 text-blue-700">
                          {request.category}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-gray-600 dark:text-gray-400 line-clamp-3 text-sm">{request.description}</p>
                      
                      <div className="flex items-center text-gray-500 gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{request.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{getTimeRemaining(request.expires_at)}</span>
                        </div>
                      </div>
                      
                      {request.request_responses?.length > 0 && (
                        <div className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded">
                          {request.request_responses.length} response{request.request_responses.length !== 1 ? 's' : ''}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                              {request.profiles?.name?.[0]?.toUpperCase() || request.user_name?.[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {request.profiles?.name || request.user_name || 'Unknown User'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {user?.id === request.user_id && (
                            <>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleHideItem(request.id, request.title)}
                                className="text-gray-500 hover:text-gray-700 p-1"
                              >
                                <EyeOff className="w-4 h-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleDeleteItem(request.id, request.title, true)}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium">
                            Respond
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">
                <MessageCircle className="w-16 h-16 mx-auto mb-6 text-gray-300" />
                <h3 className="mb-3 font-medium">No Requests Found</h3>
                <p className="mb-6">
                  {searchTerm || selectedCategory !== 'all' 
                    ? 'No requests match your search criteria' 
                    : 'Be the first to post a request for materials you need!'}
                </p>
                <Button onClick={() => onViewChange('acquire')} variant="outline" className="border-blue-600 text-blue-600 font-medium">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Post a Request
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModal.isOpen}
        onClose={() => setShareModal({ isOpen: false, title: '', itemId: '' })}
        title={shareModal.title}
        itemId={shareModal.itemId}
      />
    </div>
  )
}