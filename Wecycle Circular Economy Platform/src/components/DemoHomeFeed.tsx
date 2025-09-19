import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { HighlightButton } from './ui/highlight-button'
import { ImageWithFallback } from './figma/ImageWithFallback'
import { categories, mockUploads, mockRequests } from '../data/mockData'
import { Clock, MapPin, Heart, MessageCircle, Package, Search, Sparkles, Database, IndianRupee, Filter } from 'lucide-react'
import { toast } from 'sonner'

interface DemoHomeFeedProps {
  onViewChange: (view: string) => void
}

export function DemoHomeFeed({ onViewChange }: DemoHomeFeedProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [uploads, setUploads] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'available' | 'requests'>('available')
  
  useEffect(() => {
    // Simulate loading
    setTimeout(() => {
      setUploads(mockUploads)
      setRequests(mockRequests)
      setLoading(false)
    }, 800)
  }, [])

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      handleSearch()
    }, 300)

    return () => clearTimeout(delayedSearch)
  }, [searchTerm, selectedCategory])

  const handleSearch = () => {
    setSearchLoading(true)
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
  }

  const toggleSaved = (itemId: string, itemTitle: string) => {
    if (savedItems.has(itemId)) {
      setSavedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
      toast.success('Item removed from saved (demo mode)')
    } else {
      setSavedItems(prev => new Set(prev).add(itemId))
      toast.success(`"${itemTitle}" saved for later (demo mode)`)
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <h3 className="text-green-700 dark:text-green-400 mb-2 font-medium">Loading Demo Materials</h3>
            <p className="text-gray-600 dark:text-[#B0B7B4]">Setting up your demo experience...</p>
          </div>
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
        
        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
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
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-[#B0B7B4] w-4 h-4" />
          <Input
            placeholder="Search materials, requests, or categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 dark:bg-[#1C3A30] dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:placeholder-[#B0B7B4]"
          />
          {searchLoading && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
            </div>
          )}
        </div>
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
            Available Materials ({uploads.length})
          </HighlightButton>
          <HighlightButton
            isActive={activeTab === 'requests'}
            onClick={() => setActiveTab('requests')}
            className="flex-1 p-3 text-center transition-colors duration-200 font-medium"
            activeClassName="text-green-700 dark:text-[#E5EAE8]"
            inactiveClassName="text-gray-600 dark:text-[#B0B7B4] hover:text-green-700 dark:hover:text-green-400"
          >
            Active Requests ({requests.length})
          </HighlightButton>
        </div>
        
        {/* Tab Content */}
        {activeTab === 'available' && (
          <div>
            {uploads.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {uploads.map((upload) => (
                  <Card key={upload.id} className="overflow-hidden hover:shadow-lg transition-all duration-200 border-l-4 border-l-green-500 dark:bg-[#122821] dark:border-[#1C3A30]">
                    <div className="relative">
                      <ImageWithFallback
                        src={upload.images?.[0] || `https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=240&fit=crop`}
                        alt={upload.title}
                        className="w-full h-48 object-cover"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSaved(upload.id, upload.title)}
                        className={`absolute top-2 right-2 ${
                          savedItems.has(upload.id) ? 'text-red-500' : 'text-gray-400'
                        } bg-white/90 hover:bg-white shadow-sm`}
                      >
                        <Heart className={`w-4 h-4 ${savedItems.has(upload.id) ? 'fill-current' : ''}`} />
                      </Button>
                      {upload.price && (
                        <Badge className="absolute top-2 left-2 bg-green-600 text-white flex items-center gap-1 font-medium">
                          <IndianRupee className="w-3 h-3" />
                          {upload.price.toLocaleString('en-IN')}
                        </Badge>
                      )}
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
                              {upload.user_name?.[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {upload.user_name || 'Demo User'}
                          </span>
                        </div>
                        <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950 font-medium">
                          Contact
                        </Button>
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
            {requests.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {requests.map((request) => (
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
                      
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                              {request.user_name?.[0]?.toUpperCase() || 'U'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {request.user_name || 'Demo User'}
                          </span>
                        </div>
                        <Button size="sm" variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 font-medium">
                          Respond
                        </Button>
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
    </div>
  )
}