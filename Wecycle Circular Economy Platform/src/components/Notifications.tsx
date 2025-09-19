import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Bell, Check, Trash2, Package, MessageCircle, Heart, CheckCircle, Loader2 } from 'lucide-react'
import { notificationService } from '../services/notificationService'
import { toast } from 'sonner'

interface NotificationsProps {
  notifications: any[]
  loading: boolean
  onNotificationUpdate: () => void
}

export function Notifications({ notifications, loading, onNotificationUpdate }: NotificationsProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  const unreadNotifications = notifications.filter(n => !n.is_read)
  const readNotifications = notifications.filter(n => n.is_read)

  const markAsRead = async (notificationId: string) => {
    try {
      setActionLoading(notificationId)
      await notificationService.markAsRead(notificationId)
      onNotificationUpdate()
      toast.success('Marked as read')
    } catch (error) {
      console.error('Error marking notification as read:', error)
      toast.error('Failed to mark as read')
    } finally {
      setActionLoading(null)
    }
  }

  const markAllAsRead = async () => {
    if (notifications.length === 0) return
    
    try {
      setActionLoading('mark-all')
      await notificationService.markAllAsRead(notifications[0].user_id)
      onNotificationUpdate()
      toast.success('All notifications marked as read')
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      toast.error('Failed to mark all as read')
    } finally {
      setActionLoading(null)
    }
  }

  const deleteNotification = async (notificationId: string) => {
    try {
      setActionLoading(notificationId)
      await notificationService.deleteNotification(notificationId)
      onNotificationUpdate()
      toast.success('Notification deleted')
    } catch (error) {
      console.error('Error deleting notification:', error)
      toast.error('Failed to delete notification')
    } finally {
      setActionLoading(null)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'request_response':
        return <MessageCircle className="w-5 h-5 text-blue-500" />
      case 'upload_acquired':
        return <Package className="w-5 h-5 text-green-500" />
      case 'saved_item_removed':
        return <Heart className="w-5 h-5 text-red-500" />
      case 'request_fulfilled':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      default:
        return <Bell className="w-5 h-5 text-gray-500" />
    }
  }

  const getTimeAgo = (dateString: string) => {
    const now = new Date()
    const date = new Date(dateString)
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `${diffInHours}h ago`
    
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`
    
    return date.toLocaleDateString()
  }

  const NotificationCard = ({ notification, isUnread = false }: { notification: any, isUnread?: boolean }) => (
    <Card className={`mb-3 transition-all hover:shadow-md ${isUnread ? 'border-blue-200 bg-blue-50/30' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            {getNotificationIcon(notification.type)}
          </div>
          
          <div className="flex-grow min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-grow">
                <h4 className={`${isUnread ? 'text-gray-900' : 'text-gray-700'}`}>
                  {notification.title}
                </h4>
                <p className={`mt-1 text-sm ${isUnread ? 'text-gray-700' : 'text-gray-600'}`}>
                  {notification.message}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {getTimeAgo(notification.created_at)}
                </p>
              </div>
              
              {isUnread && (
                <div className="flex-shrink-0">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-shrink-0 flex gap-1">
            {isUnread && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAsRead(notification.id)}
                className="text-gray-500 hover:text-blue-600"
                title="Mark as read"
                disabled={actionLoading === notification.id}
              >
                {actionLoading === notification.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteNotification(notification.id)}
              className="text-gray-500 hover:text-red-600"
              title="Delete notification"
              disabled={actionLoading === notification.id}
            >
              {actionLoading === notification.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading notifications...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-green-700 mb-2">Notifications</h1>
            <p className="text-gray-600">Stay updated on your materials and requests</p>
          </div>
          
          {unreadNotifications.length > 0 && (
            <Button
              variant="outline"
              onClick={markAllAsRead}
              className="text-blue-600 border-blue-600 hover:bg-blue-50"
              disabled={actionLoading === 'mark-all'}
            >
              {actionLoading === 'mark-all' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="unread" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="unread" className="relative">
            Unread
            {unreadNotifications.length > 0 && (
              <Badge className="ml-2 bg-blue-500 text-white" variant="secondary">
                {unreadNotifications.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">
            All Notifications
            <Badge className="ml-2 bg-gray-100 text-gray-700" variant="secondary">
              {notifications.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unread">
          {unreadNotifications.length > 0 ? (
            <div>
              {unreadNotifications.map((notification) => (
                <NotificationCard 
                  key={notification.id} 
                  notification={notification} 
                  isUnread={true}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Bell className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <h3 className="mb-2">All caught up!</h3>
              <p>You have no unread notifications.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {notifications.length > 0 ? (
            <div>
              {notifications.map((notification) => (
                <NotificationCard 
                  key={notification.id} 
                  notification={notification} 
                  isUnread={!notification.is_read}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Bell className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <h3 className="mb-2">No notifications yet</h3>
              <p>When you start using Wecycle, your notifications will appear here.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Notification Settings Card */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <h3 className="mb-4">Notification Preferences</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-center justify-between">
              <span>New responses to my requests</span>
              <Badge variant="secondary" className="bg-green-100 text-green-700">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>When my uploads are acquired</span>
              <Badge variant="secondary" className="bg-green-100 text-green-700">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>When saved items are removed</span>
              <Badge variant="secondary" className="bg-green-100 text-green-700">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Weekly activity summary</span>
              <Badge variant="secondary" className="bg-gray-100 text-gray-600">Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}