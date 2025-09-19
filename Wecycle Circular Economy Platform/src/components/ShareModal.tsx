import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Share, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  itemId: string
}

export function ShareModal({ isOpen, onClose, title, itemId }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  
  const shareUrl = `${window.location.origin}/#home?item=${itemId}`
  
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Check out this material on Wecycle: ${title}`,
          text: `Found this on Wecycle - "${title}". Join the circular economy!`,
          url: shareUrl,
        })
      } catch (error) {
        // User cancelled or error occurred
        console.log('Share cancelled or failed')
      }
    } else {
      // Fallback for browsers that don't support native sharing
      handleCopyLink()
    }
  }
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Link copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share className="w-5 h-5 text-green-600" />
            Share Material
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="font-medium text-sm line-clamp-2">{title}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Share this sustainable material with others</p>
          </div>
          
          <div className="flex flex-col gap-3">
            {navigator.share && (
              <Button onClick={handleShare} className="bg-green-600 hover:bg-green-700 text-white">
                <Share className="w-4 h-4 mr-2" />
                Share via System
              </Button>
            )}
            
            <Button 
              variant="outline" 
              onClick={handleCopyLink}
              className="border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Link Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
          
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Help grow the circular economy by sharing sustainable materials
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}