import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { User, MapPin, Package, MessageCircle, Heart, Calendar, Award, LogIn, UserPlus, Settings, Edit3 } from 'lucide-react'

interface GuestProfileProps {
  onSignIn: () => void
  onSignUp: () => void
}

export function GuestProfile({ onSignIn, onSignUp }: GuestProfileProps) {
  return (
    <div className="relative">
      {/* Content Layer */}
      <div className="max-w-4xl mx-auto p-6 space-y-6 filter blur-[1px] pointer-events-none">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Info Card */}
          <div className="lg:col-span-1">
            <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
              <CardContent className="p-6 text-center">
                <div className="w-24 h-24 bg-green-100 dark:bg-green-900 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <User className="w-12 h-12 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-[#E5EAE8] mb-2">John Doe</h2>
                <div className="flex items-center justify-center text-gray-600 dark:text-[#B0B7B4] mb-4">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span>Mumbai, Maharashtra</span>
                </div>
                <Badge className="bg-green-100 text-green-700 mb-4 dark:bg-green-900 dark:text-green-300">
                  <Award className="w-3 h-3 mr-1" />
                  Eco Champion
                </Badge>
                <div className="flex items-center justify-center text-gray-500 text-sm">
                  <Calendar className="w-4 h-4 mr-1" />
                  <span>Member since Jan 2024</span>
                </div>
                <Button className="w-full mt-4 bg-green-600 hover:bg-green-700">
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit Profile
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-6 dark:bg-[#122821] dark:border-[#1C3A30]">
              <CardHeader>
                <CardTitle className="text-base dark:text-[#E5EAE8]">Impact Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-[#B0B7B4]">Materials Shared</span>
                  <span className="font-semibold dark:text-[#E5EAE8]">--</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-[#B0B7B4]">Requests Posted</span>
                  <span className="font-semibold dark:text-[#E5EAE8]">--</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-[#B0B7B4]">Community Helped</span>
                  <span className="font-semibold dark:text-[#E5EAE8]">--</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-[#B0B7B4]">CO₂ Saved (kg)</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">--</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Activity Overview */}
            <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
              <CardHeader>
                <CardTitle className="flex items-center dark:text-[#E5EAE8]">
                  <Package className="w-5 h-5 mr-2 text-green-600" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                      <Package className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium dark:text-[#E5EAE8]">Shared "Office Furniture"</p>
                      <p className="text-xs text-gray-500">2 days ago</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium dark:text-[#E5EAE8]">Posted request for "Electronics"</p>
                      <p className="text-xs text-gray-500">5 days ago</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="w-8 h-8 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                      <Heart className="w-4 h-4 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium dark:text-[#E5EAE8]">Saved 3 new materials</p>
                      <p className="text-xs text-gray-500">1 week ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Settings Preview */}
            <Card className="dark:bg-[#122821] dark:border-[#1C3A30]">
              <CardHeader>
                <CardTitle className="flex items-center dark:text-[#E5EAE8]">
                  <Settings className="w-5 h-5 mr-2 text-gray-600" />
                  Account Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border dark:border-[#1C3A30]">
                    <div>
                      <p className="font-medium dark:text-[#E5EAE8]">Email Notifications</p>
                      <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Get notified about activity</p>
                    </div>
                    <Badge variant="secondary">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border dark:border-[#1C3A30]">
                    <div>
                      <p className="font-medium dark:text-[#E5EAE8]">Location Privacy</p>
                      <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Control location visibility</p>
                    </div>
                    <Badge variant="secondary">City Only</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border dark:border-[#1C3A30]">
                    <div>
                      <p className="font-medium dark:text-[#E5EAE8]">Profile Visibility</p>
                      <p className="text-sm text-gray-600 dark:text-[#B0B7B4]">Who can see your profile</p>
                    </div>
                    <Badge variant="secondary">Community</Badge>
                  </div>
                </div>
                <Button variant="outline" className="w-full mt-4 dark:border-[#1C3A30] dark:text-[#E5EAE8] dark:hover:bg-[#1C3A30]">
                  Manage All Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Authentication Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-[#0B1F17]/80 backdrop-blur-sm">
        <Card className="w-full max-w-md mx-4 shadow-xl border-2 border-green-200 dark:border-green-700">
          <CardHeader className="text-center">
            <User className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <CardTitle className="text-green-700 dark:text-green-400">
              Create Your Profile
            </CardTitle>
            <p className="text-gray-600 dark:text-[#B0B7B4] text-sm">
              Build your profile to track your impact, manage settings, and connect with the community
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={onSignUp}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Your Profile
            </Button>
            <Button 
              onClick={onSignIn}
              variant="outline"
              className="w-full border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950 font-medium"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Access Your Profile
            </Button>
            <div className="text-center text-xs text-gray-500 dark:text-[#B0B7B4]">
              Track your environmental impact and community contributions
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}