import { useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Home, Upload, Package, Bell, User, Database, LogIn, UserPlus } from 'lucide-react'

interface NavigationProps {
  currentView: string
  onViewChange: (view: string) => void
  notificationCount: number
  showSetupButton?: boolean
  onSetupClick?: () => void
  user?: any
  onSignInClick?: () => void
  onSignUpClick?: () => void
}

export function Navigation({ 
  currentView, 
  onViewChange, 
  notificationCount, 
  showSetupButton, 
  onSetupClick,
  user,
  onSignInClick,
  onSignUpClick
}: NavigationProps) {
  // Clean notification count to ensure no negative values
  const cleanNotificationCount = Math.max(0, notificationCount || 0)

  // Mobile navigation items - same for both authenticated and guest users
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'distribute', label: 'Share', icon: Upload },
    { id: 'inventory', label: 'Items', icon: Package },
    { id: 'notifications', label: 'Alerts', icon: Bell, count: user ? cleanNotificationCount : 0 },
    { id: 'profile', label: 'Profile', icon: User },
  ]

  // Desktop items - show inventory in header instead of post requests
  const desktopNavItems = [
    { id: 'home', label: 'Browse', icon: Home },
    { id: 'distribute', label: 'Share Materials', icon: Upload },
    { id: 'inventory', label: 'My Inventory', icon: Package },
    { id: 'notifications', label: 'Notifications', icon: Bell, count: user ? cleanNotificationCount : 0 },
    { id: 'profile', label: 'Profile', icon: User },
  ]

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center justify-between px-6 py-4 bg-white dark:bg-[#0B1F17] border-b border-gray-200 dark:border-[#1C3A30]">
        <div className="flex items-center space-x-8">
          <button 
            onClick={() => onViewChange('home')}
            className="text-green-700 dark:text-green-400 font-semibold text-xl hover:text-green-600 dark:hover:text-green-300 transition-colors"
          >
            Wecycle
          </button>
          <div className="flex space-x-1">
            {desktopNavItems.map((item) => (
              <Button
                key={item.id}
                variant={currentView === item.id ? "default" : "ghost"}
                onClick={() => onViewChange(item.id)}
                className={`relative ${
                  currentView === item.id 
                    ? "bg-green-100 dark:bg-[#145C45] text-green-700 dark:text-[#E5EAE8] hover:bg-green-200 dark:hover:bg-[#145C45]" 
                    : "text-gray-600 dark:text-[#B0B7B4] hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-[#122821]"
                }`}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {item.id === 'notifications' && item.count && item.count > 0 
                  ? `Notifications (${item.count})` 
                  : item.label
                }
                {item.count && item.count > 0 && item.id === 'notifications' && (
                  <Badge className="ml-2 bg-red-500 text-white" variant="secondary">
                    {item.count}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </div>
        
        {/* Right side actions */}
        <div className="flex items-center space-x-3">
          {user ? (
            // Authenticated user - show profile button (already included in nav)
            null
          ) : (
            // Guest user - show sign up and sign in buttons
            <>
              <Button
                onClick={onSignUpClick}
                className="bg-green-600 hover:bg-green-700 text-white font-medium"
                size="sm"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Sign Up
              </Button>
              <Button
                onClick={onSignInClick}
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950 font-medium"
                size="sm"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            </>
          )}
          
          {showSetupButton && onSetupClick && (
            <Button
              onClick={onSetupClick}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
              size="sm"
            >
              <Database className="h-4 w-4 mr-2" />
              Setup Database
            </Button>
          )}
        </div>
      </nav>

      {/* Mobile Top Bar */}
      <nav className="md:hidden bg-white dark:bg-[#0B1F17] border-b border-gray-200 dark:border-[#1C3A30]">
        <div className="flex items-center justify-between px-4 py-3">
          <button 
            onClick={() => onViewChange('home')}
            className="text-green-700 dark:text-green-400 font-semibold text-lg hover:text-green-600 dark:hover:text-green-300 transition-colors"
          >
            Wecycle
          </button>
          
          {/* Right side actions on mobile */}
          <div className="flex items-center space-x-2">
            {user ? (
              // Authenticated user - minimal profile indicator
              <Button
                variant="ghost"
                onClick={() => onViewChange('profile')}
                className="text-gray-600 dark:text-[#B0B7B4] hover:text-green-700 dark:hover:text-green-400"
                size="sm"
              >
                <User className="h-5 w-5" />
              </Button>
            ) : (
              // Guest user - compact auth buttons
              <>
                <Button
                  onClick={onSignUpClick}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium"
                  size="sm"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Sign Up
                </Button>
                <Button
                  onClick={onSignInClick}
                  variant="outline"
                  className="border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950 font-medium"
                  size="sm"
                >
                  <LogIn className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#0B1F17] border-t border-gray-200 dark:border-[#1C3A30] z-50 safe-area-pb">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => onViewChange(item.id)}
              className={`flex flex-col items-center p-2 h-auto min-w-0 flex-1 ${
                currentView === item.id 
                  ? "text-green-700 dark:text-green-400" 
                  : "text-gray-600 dark:text-[#B0B7B4]"
              }`}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" />
                {item.count && item.count > 0 && item.id === 'notifications' && (
                  <Badge className="absolute -top-2 -right-2 bg-red-500 text-white h-4 w-4 text-xs flex items-center justify-center p-0 min-w-[16px]">
                    {item.count}
                  </Badge>
                )}
              </div>
              <span className="text-xs mt-1 truncate">
                {item.label}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}