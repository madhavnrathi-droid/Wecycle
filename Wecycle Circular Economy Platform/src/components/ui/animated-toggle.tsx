import { motion } from 'motion/react'
import { useRef, useLayoutEffect, useState, useCallback } from 'react'

interface AnimatedToggleProps {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function AnimatedToggle({ options, value, onChange, className = '' }: AnimatedToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 })
  const [isInitialized, setIsInitialized] = useState(false)

  const updateIndicatorPosition = useCallback(() => {
    if (!containerRef.current) return

    const activeIndex = options.findIndex(opt => opt.value === value)
    if (activeIndex === -1) return

    const buttons = containerRef.current.querySelectorAll('button')
    const activeButton = buttons[activeIndex] as HTMLElement
    
    if (activeButton) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const buttonRect = activeButton.getBoundingClientRect()
      
      setIndicatorStyle({
        width: buttonRect.width,
        left: buttonRect.left - containerRect.left
      })
      
      if (!isInitialized) {
        setIsInitialized(true)
      }
    }
  }, [value, options, isInitialized])

  useLayoutEffect(() => {
    updateIndicatorPosition()
    
    // Update position on window resize
    const handleResize = () => {
      updateIndicatorPosition()
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateIndicatorPosition])

  return (
    <div 
      ref={containerRef}
      className={`relative flex bg-gray-100 dark:bg-[#1C3A30] rounded-lg p-1 overflow-hidden ${className}`}
    >
      {/* Animated green background indicator */}
      <motion.div
        className="absolute bg-green-100 dark:bg-[#145C45] rounded-md shadow-sm"
        initial={false}
        animate={isInitialized ? {
          x: indicatorStyle.left,
          width: indicatorStyle.width
        } : undefined}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 25,
          mass: 0.6,
          duration: 0.3
        }}
        style={{
          top: '4px',
          bottom: '4px',
          height: 'calc(100% - 8px)',
          borderRadius: '6px',
          ...(isInitialized ? {} : {
            width: indicatorStyle.width,
            transform: `translateX(${indicatorStyle.left}px)`
          })
        }}
      />

      {/* Animated border highlight */}
      <motion.div
        className="absolute border-2 rounded-md"
        initial={false}
        animate={isInitialized ? {
          x: indicatorStyle.left,
          width: indicatorStyle.width,
          borderColor: 'rgb(34, 197, 94)', // green-500
          opacity: 1
        } : undefined}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 25,
          mass: 0.6,
          duration: 0.3
        }}
        style={{
          top: '4px',
          bottom: '4px',
          height: 'calc(100% - 8px)',
          borderRadius: '6px',
          ...(isInitialized ? {} : {
            width: indicatorStyle.width,
            transform: `translateX(${indicatorStyle.left}px)`,
            borderColor: 'rgb(34, 197, 94)',
            opacity: 1
          })
        }}
      />
      
      {/* Option buttons */}
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex-1 py-2.5 px-4 text-sm font-medium rounded-md transition-all duration-200 ease-out ${
            value === option.value
              ? 'text-green-700 dark:text-[#E5EAE8]'
              : 'text-gray-600 dark:text-[#B0B7B4] hover:text-green-700 dark:hover:text-green-400'
          }`}
          style={{
            WebkitTapHighlightColor: 'transparent'
          }}
        >
          <span className="relative z-10 select-none">
            {option.label}
          </span>
        </button>
      ))}
    </div>
  )
}