import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ImageWithFallback } from './figma/ImageWithFallback'
import { useAuth } from '../hooks/useAuth'
import { uploadService } from '../services/uploadService'
import { requestService } from '../services/requestService'
import { savedItemsService } from '../services/notificationService'
import { Package, MessageCircle, Heart, Clock, MapPin, Edit3, Trash2, Eye, EyeOff, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function Inventory() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('uploads')
  const [uploads, setUploads] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [savedItems, setSavedItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    if (user) {
      loadInventory()
    }
  }, [user])

  const loadInventory = async () => {
    if (!user) return

    try {
      setLoading(true)
      const [uploadsData, requestsData, savedData] = await Promise.all([
        uploadService.getUserUploads(user.id),
        requestService.getUserRequests(user.id),
        savedItemsService.getSavedItems(user.id)
      ])

      setUploads(uploadsData || [])
      setRequests(requestsData || [])
      setSavedItems(savedData || [])
    } catch (error) {
      console.error('Error loading inventory:', error)
      toast.error('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }

  const markAsAcquired = async (uploadId: string, title: string) => {
    try {
      setActionLoading(uploadId)
      await uploadService.markAsAcquired(uploadId)
      await loadInventory()
      toast.success(`"${title}" marked as acquired`)
    } catch (error) {
      console.error('Error marking as acquired:', error)
      toast.error('Failed to mark as acquired')
    } finally {
      setActionLoading(null)
    }
  }

  const deleteUpload = async (uploadId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      return
    }

    try {
      setActionLoading(uploadId)
      await uploadService.deleteUpload(uploadId)
      await loadInventory()
      toast.success(`"${title}" deleted successfully`)
    } catch (error) {
      console.error('Error deleting upload:', error)
      toast.error('Failed to delete upload')
    } finally {
      setActionLoading(null)
    }
  }

  const deleteRequest = async (requestId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete the request for "${title}"?`)) {
      return
    }

    try {
      setActionLoading(requestId)
      await requestService.deleteRequest(requestId)
      await loadInventory()
      toast.success(`Request for "${title}" deleted successfully`)
    } catch (error) {
      console.error('Error deleting request:', error)
      toast.error('Failed to delete request')
    } finally {
      setActionLoading(null)
    }
  }

  const unsaveItem = async (uploadId: string, title: string) => {
    if (!user) return

    try {
      setActionLoading(uploadId)
      await savedItemsService.unsaveItem(uploadId, user.id)
      await loadInventory()
      toast.success(`"${title}" removed from saved items`)
    } catch (error) {
      console.error('Error unsaving item:', error)
      toast.error('Failed to remove from saved items')
    } finally {
      setActionLoading(null)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700'
      case 'acquired': return 'bg-blue-100 text-blue-700'
      case 'lapsed': return 'bg-red-100 text-red-700'
      case 'completed': return 'bg-blue-100 text-blue-700'
      case 'inactive': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const filterItems = (items: any[], type: 'upload' | 'request') => {
    return items.filter(item => {
      const matchesSearch = searchTerm === '' || 
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      
      return matchesSearch && matchesStatus
    })
  }

  const filteredUploads = filterItems(uploads, 'upload')
  const filteredRequests = filterItems(requests, 'request')
  
  const uploadStats = {
    total: uploads.length,
    active: uploads.filter(u => u.status === 'active').length,
    acquired: uploads.filter(u => u.status === 'acquired').length,
    lapsed: uploads.filter(u => u.status === 'lapsed').length
  }

  const requestStats = {
    total: requests.length,
    active: requests.filter(r => r.status === 'active').length,
    completed: requests.filter(r => r.status === 'completed').length,
    responses: requests.reduce((sum, r) => sum + (r.request_responses?.length || 0), 0)
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your inventory...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-green-700 mb-2">My Inventory</h1>
          <p className="text-gray-600">Manage your shared materials, requests, and saved items</p>
        </div>
        <Button onClick={loadInventory} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Package className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Uploads</p>
                <p className="text-xl">{uploadStats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MessageCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-xl">{requestStats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Heart className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Saved Items</p>
                <p className="text-xl">{savedItems.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Items Shared</p>
                <p className="text-xl">{uploadStats.acquired}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <Input
          placeholder="Search your items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="acquired">Acquired</SelectItem>
            <SelectItem value="lapsed">Lapsed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inventory Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="uploads">
            My Uploads ({filteredUploads.length})
          </TabsTrigger>
          <TabsTrigger value="requests">
            My Requests ({filteredRequests.length})
          </TabsTrigger>
          <TabsTrigger value="saved">
            Saved Items ({savedItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uploads">
          {filteredUploads.length > 0 ? (
            <div className="space-y-4">
              {filteredUploads.map((upload) => (
                <Card key={upload.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <ImageWithFallback
                        src={upload.images?.[0] || `https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=100&h=100&fit=crop`}
                        alt={upload.title}
                        className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                      />
                      
                      <div className="flex-grow">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-gray-900 mb-1">{upload.title}</h3>
                            <p className="text-gray-600 text-sm line-clamp-2 mb-2">{upload.description}</p>
                            
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {upload.location}
                              </div>
                              {upload.expires_at && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {getTimeRemaining(upload.expires_at)}
                                </div>
                              )}
                              <span>Created {new Date(upload.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(upload.status)}>
                              {upload.status.charAt(0).toUpperCase() + upload.status.slice(1)}
                            </Badge>
                            
                            {upload.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markAsAcquired(upload.id, upload.title)}
                                disabled={actionLoading === upload.id}
                                className="text-blue-600 border-blue-600 hover:bg-blue-50"
                              >
                                {actionLoading === upload.id ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
                                ) : (
                                  <CheckCircle className="w-3 h-3" />
                                )}
                                Mark Acquired
                              </Button>
                            )}
                            
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteUpload(upload.id, upload.title)}
                              disabled={actionLoading === upload.id}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {actionLoading === upload.id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <h3 className="mb-2">No uploads found</h3>
              <p>
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'You haven\'t shared any materials yet'
                }
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests">
          {filteredRequests.length > 0 ? (
            <div className="space-y-4">
              {filteredRequests.map((request) => (
                <Card key={request.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-grow">
                        <h3 className="text-gray-900 mb-1">{request.title}</h3>
                        <p className="text-gray-600 text-sm line-clamp-2 mb-2">{request.description}</p>
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {request.location}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {getTimeRemaining(request.expires_at)}
                          </div>
                          <span>Created {new Date(request.created_at).toLocaleDateString()}</span>
                        </div>
                        
                        {request.request_responses?.length > 0 && (
                          <div className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
                            {request.request_responses.length} response{request.request_responses.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(request.status)}>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </Badge>
                        
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteRequest(request.id, request.title)}
                          disabled={actionLoading === request.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {actionLoading === request.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <h3 className="mb-2">No requests found</h3>
              <p>
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'You haven\'t posted any requests yet'
                }
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="saved">
          {savedItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedItems.map((savedItem) => (
                <Card key={savedItem.id} className="overflow-hidden hover:shadow-lg transition-all">
                  <div className="relative">
                    <ImageWithFallback
                      src={savedItem.uploads?.images?.[0] || `https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=240&fit=crop`}
                      alt={savedItem.uploads?.title || 'Saved item'}
                      className="w-full h-48 object-cover"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unsaveItem(savedItem.upload_id, savedItem.uploads?.title)}
                      disabled={actionLoading === savedItem.upload_id}
                      className="absolute top-2 right-2 text-red-500 bg-white/90 hover:bg-white shadow-sm"
                    >
                      {actionLoading === savedItem.upload_id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
                      ) : (
                        <Heart className="w-4 h-4 fill-current" />
                      )}
                    </Button>
                  </div>
                  <CardHeader className="pb-2">
                    <h3 className="text-gray-900 line-clamp-2">
                      {savedItem.uploads?.title || 'Unknown Item'}
                    </h3>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-gray-600 line-clamp-2 text-sm">
                      {savedItem.uploads?.description || 'No description available'}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                          <span className="text-xs text-green-700">
                            {savedItem.uploads?.profiles?.name?.[0]?.toUpperCase() || 'U'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-600">
                          {savedItem.uploads?.profiles?.name || 'Unknown User'}
                        </span>
                      </div>
                      <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50">
                        Contact
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Heart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <h3 className="mb-2">No saved items</h3>
              <p>Items you save for later will appear here</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}