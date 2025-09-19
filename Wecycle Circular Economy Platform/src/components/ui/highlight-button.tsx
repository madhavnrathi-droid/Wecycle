import { motion } from 'motion/react'
import { ReactNode } from 'react'

interface HighlightButtonProps {
  children: ReactNode
  isActive: boolean
  onClick: () => void
  className?: string
  activeClassName?: string
  inactiveClassName?: string
}

export function HighlightButton({ 
  children, 
  isActive, 
  onClick, 
  className = '',
  activeClassName = '',
  inactiveClassName = ''
}: HighlightButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-lg transition-all duration-200 ${className} ${
        isActive ? activeClassName : inactiveClassName
      }`}
    >
      {/* Animated background highlight */}
      <motion.div
        className="absolute inset-0 bg-green-100 dark:bg-[#145C45] rounded-lg"
        initial={false}
        animate={{
          opacity: isActive ? 1 : 0,
          scale: isActive ? 1 : 0.95
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 25,
          duration: 0.2
        }}
      />
      
      {/* Animated border */}
      <motion.div
        className="absolute inset-0 border-2 rounded-lg"
        initial={false}
        animate={{
          borderColor: isActive 
            ? 'rgb(34, 197, 94)' // green-500
            : 'transparent',
          opacity: isActive ? 1 : 0
        }}
        transition={{
          duration: 0.2,
          ease: "easeOut"
        }}
      />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </button>
  )
}