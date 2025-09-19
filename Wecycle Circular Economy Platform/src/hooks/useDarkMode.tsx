import { createContext, useContext, useEffect, useState } from 'react'

interface DarkModeContextType {
  isDark: boolean
  toggle: () => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  theme: 'light' | 'dark' | 'system'
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined)

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('wecycle-theme') as 'light' | 'dark' | 'system') || 'system'
    }
    return 'system'
  })
  
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const updateTheme = () => {
      let shouldBeDark = false
      
      if (theme === 'system') {
        shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      } else {
        shouldBeDark = theme === 'dark'
      }
      
      setIsDark(shouldBeDark)
      
      if (shouldBeDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    updateTheme()
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') {
        updateTheme()
      }
    }
    
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setThemeState(newTheme)
    localStorage.setItem('wecycle-theme', newTheme)
  }

  const toggle = () => {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <DarkModeContext.Provider value={{ isDark, toggle, setTheme, theme }}>
      {children}
    </DarkModeContext.Provider>
  )
}

export function useDarkMode() {
  const context = useContext(DarkModeContext)
  if (context === undefined) {
    throw new Error('useDarkMode must be used within a DarkModeProvider')
  }
  return context
}