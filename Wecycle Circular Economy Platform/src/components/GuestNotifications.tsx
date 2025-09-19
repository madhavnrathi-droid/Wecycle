import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Bell, MessageCircle, Heart, Package, Clock, LogIn, UserPlus, Check, Trash2 } from 'lucide-react'

interface GuestNotificationsProps {
  onSignIn: () => void
  onSignUp: () => void
}

export function GuestNotifications({ onSignIn, onSignUp }: GuestNotificationsProps) {
  // Mock data for demonstration
  const mockNotifications = [
    {
      id: '1',
      type: 'item_interest',
      title: 'New Inquiry on Your Item',
      message: 'Someone is interested in your "Wooden Office Desk"',
      created_at: '2025-01-25T10:00:00Z',
      is_read: false,
      icon: MessageCircle,
      color: 'text-blue-600'
    },
    {
      id: '2',
      type: 'item_saved',
      title: 'Item Saved',
      message: 'Your "Electronic Components Bundle" was saved by 3 users',
      created_at: '2025-01-24T15:30:00Z',
      is_read: false,
      icon: Heart,
      color: 'text-red-500'
    },
    {
      id: '3',
      type: 'request_response',
      title: 'Response to Your Request',
      message: 'Someone responded to your request for "Construction Materials"',
      created_at: '2025-01-24T09:15:00Z',
      is_read: true,
      icon: Package,
      color: 'text-green-600'
    },
    {
      id: '4',
      type: 'item_expiring',
      title: 'Item Expiring Soon',
      message: 'Your "Office Supplies" listing expires in 2 days',
      created_at: '2025-01-23T12:00:00Z',
      is_read: true,
      icon: Clock,
      color: 'text-orange-600'
    },
    {
      id: '5',
      type: 'new_match',
      title: 'New Match Found',
      message: 'We found materials matching your saved search "furniture"',
      created_at: '2025-01-22T16:45:00Z',
      is_read: true,
      icon: Bell,
      color: 'text-purple-600'
    }
  ]

  return (
    <div className="relative">
      {/* Content Layer */}
      <div className="max-w-4xl mx-auto p-6 space-y-6 filter blur-[1px] pointer-events-none">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-green-700 dark:text-green-400 font-semibold mb-2">Notifications</h1>
            <p className="text-gray-600 dark:text-[#B0B7B4]">
              Stay updated on your materials, requests, and community activity
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" className="dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]">
              <Check className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
            <Button variant="outline" size="sm" className="dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Notification Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-[#E5EAE8]">--</p>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Total Notifications</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                  <MessageCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-[#E5EAE8]">--</p>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Unread</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Package className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-[#E5EAE8]">--</p>
                  <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">This Week</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notifications List */}
        <div className="space-y-4">
          {mockNotifications.map((notification) => {
            const IconComponent = notification.icon
            return (
              <Card 
                key={notification.id} 
                className={`hover:shadow-md transition-all duration-200 dark:bg-[#122821] dark:border-[#1C3A30] ${
                  !notification.is_read ? 'border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start space-x-4">
                    <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-800`}>
                      <IconComponent className={`h-5 w-5 ${notification.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 dark:text-[#E5EAE8] mb-1">
                            {notification.title}
                            {!notification.is_read && (
                              <Badge className="ml-2 bg-blue-100 text-blue-700 text-xs">New</Badge>
                            )}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-[#B0B7B4] mb-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            2 hours ago
                          </p>
                        </div>
                        <div className="flex space-x-1 ml-4">
                          {!notification.is_read && (
                            <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700 dark:hover:bg-[#1C3A30]">
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-gray-500 hover:text-red-600 dark:hover:bg-[#1C3A30]">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Load More */}
        <div className="text-center">
          <Button variant="outline" className="dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]">
            Load More Notifications
          </Button>
        </div>
      </div>

      {/* Authentication Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0B1F17]/80 backdrop-blur-sm">
        <Card className="w-full max-w-md mx-4 shadow-xl border-2 border-green-200 dark:border-green-700">
          <CardHeader className="text-center">
            <Bell className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <CardTitle className="text-green-700 dark:text-green-400">
              Stay in the Loop
            </CardTitle>
            <p className="text-gray-600 dark:text-[#B0B7B4] text-sm">
              Get real-time notifications about inquiries, saved items, matches, and community activity
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={onSignUp}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Join to Get Notifications
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
              Never miss an opportunity to share or find materials
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}