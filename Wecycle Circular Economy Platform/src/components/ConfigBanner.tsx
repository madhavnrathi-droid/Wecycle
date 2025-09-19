import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { AlertCircle, Database, X, ExternalLink } from 'lucide-react'

export function ConfigBanner() {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return null

  return (
    <Card className="border-blue-200 bg-blue-50 mb-6">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
          
          <div className="flex-grow">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-medium text-blue-900 mb-1">
                  Backend Configuration Required
                </h4>
                <p className="text-blue-800 text-sm mb-3">
                  This demo uses mock data. To enable full functionality with real user authentication, 
                  database storage, and real-time features, connect your Supabase project.
                </p>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Authentication Disabled
                  </Badge>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Mock Data Only
                  </Badge>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    No Real-time Updates
                  </Badge>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => window.open('https://supabase.com', '_blank')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Get Supabase
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-600 text-blue-600 hover:bg-blue-100"
                    onClick={() => window.open('https://github.com/your-repo#setup', '_blank')}
                  >
                    Setup Instructions
                  </Button>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsVisible(false)}
                className="text-blue-600 hover:text-blue-800 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}