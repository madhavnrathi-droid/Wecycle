export function LoadingSpinner({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <svg 
        className="animate-spin" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Recycling arrows in green */}
        <path 
          d="M12 2L9 5.5L7 3.5L12 2Z" 
          fill="currentColor" 
          className="text-green-600"
        />
        <path 
          d="M19.5 7L16.5 9L18.5 11L19.5 7Z" 
          fill="currentColor" 
          className="text-green-600"
        />
        <path 
          d="M5.5 17L8.5 15L6.5 13L5.5 17Z" 
          fill="currentColor" 
          className="text-green-600"
        />
        
        {/* Curved arrows connecting the points */}
        <path 
          d="M12 4C7.6 4 4 7.6 4 12C4 16.4 7.6 20 12 20C16.4 20 20 16.4 20 12" 
          stroke="currentColor" 
          strokeWidth="2" 
          fill="none" 
          className="text-green-600 opacity-60"
          strokeLinecap="round"
        />
        
        {/* Additional recycling symbol elements */}
        <circle 
          cx="12" 
          cy="12" 
          r="8" 
          stroke="currentColor" 
          strokeWidth="1" 
          fill="none" 
          className="text-green-600 opacity-30"
        />
      </svg>
    </div>
  )
}