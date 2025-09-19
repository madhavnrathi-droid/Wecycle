import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Package, Upload, Clock, MapPin, Plus, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react'

interface GuestInventoryProps {
  onSignIn: () => void
  onSignUp: () => void
}

export function GuestInventory({ onSignIn, onSignUp }: GuestInventoryProps) {
  // Mock data for demonstration
  const mockItems = [
    {
      id: '1',
      title: 'Wooden Office Desk',
      category: 'Furniture',
      status: 'active',
      views: 24,
      inquiries: 3,
      created_at: '2025-01-15T10:00:00Z',
      expires_at: '2025-02-15T10:00:00Z',
      location: 'Mumbai, Maharashtra'
    },
    {
      id: '2', 
      title: 'Electronic Components Bundle',
      category: 'Electronics',
      status: 'expired',
      views: 12,
      inquiries: 1,
      created_at: '2025-01-10T10:00:00Z',
      expires_at: '2025-01-25T10:00:00Z',
      location: 'Bangalore, Karnataka'
    },
    {
      id: '3',
      title: 'Construction Materials - Bricks',
      category: 'Construction',
      status: 'active',
      views: 45,
      inquiries: 8,
      created_at: '2025-01-20T10:00:00Z',
      expires_at: '2025-03-01T10:00:00Z',
      location: 'Delhi, NCR'
    }
  ]

  return (
    <div className="relative">
      {/* Content Layer */}
      <div className="max-w-4xl mx-auto p-6 space-y-6 filter blur-[1px] pointer-events-none">
        {/* Header */}
        <div>
          <h1 className="text-green-700 dark:text-green-400 font-semibold mb-2">My Inventory</h1>
          <p className="text-gray-600 dark:text-[#B0B7B4]">
            Manage your shared materials and track their performance
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <Button className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Material
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Package className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-[#E5EAE8]">--</p>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Total Items</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-[#E5EAE8]">--</p>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                  <Eye className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-[#E5EAE8]">--</p>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Total Views</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-[#E5EAE8]">--</p>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Inquiries</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockItems.map((item) => (
            <Card key={item.id} className="hover:shadow-lg transition-all duration-200 dark:bg-[#122821] dark:border-[#1C3A30]">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base line-clamp-2 dark:text-[#E5EAE8]">{item.title}</CardTitle>
                  <Badge 
                    variant={item.status === 'active' ? 'default' : 'secondary'}
                    className={item.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : ''}
                  >
                    {item.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-[#B0B7B4]">{item.category}</span>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Eye className="h-3 w-3" />
                      <span>{item.views}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Package className="h-3 w-3" />
                      <span>{item.inquiries}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center text-gray-500 text-xs">
                  <MapPin className="w-3 h-3 mr-1" />
                  <span>{item.location}</span>
                </div>
                
                <div className="flex items-center text-gray-500 text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  <span>Expires in 15 days</span>
                </div>
                
                <div className="flex space-x-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1 dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]">
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="text-gray-500 dark:hover:bg-[#1C3A30]">
                    <EyeOff className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Authentication Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0B1F17]/80 backdrop-blur-sm">
        <Card className="w-full max-w-md mx-4 shadow-xl border-2 border-green-200 dark:border-green-700">
          <CardHeader className="text-center">
            <Package className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <CardTitle className="text-green-700 dark:text-green-400">
              Access Your Inventory
            </CardTitle>
            <p className="text-gray-600 dark:text-[#B0B7B4] text-sm">
              Sign in to manage your shared materials, track views, and respond to inquiries
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={onSignUp}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Account to Get Started
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
              Join thousands helping build a circular economy
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}