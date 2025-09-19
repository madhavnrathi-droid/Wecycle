import { projectId, publicAnonKey } from '../utils/supabase/info'

// Test JWT token validity
export const testJWTToken = () => {
  try {
    const token = publicAnonKey
    const parts = token.split('.')
    
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT structure (not 3 parts)' }
    }
    
    // Decode header and payload
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')))
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    
    console.log('🔍 JWT Token Analysis:', {
      header,
      payload,
      tokenLength: token.length,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'No expiry',
      issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : 'Unknown',
      isExpired: payload.exp ? Date.now() / 1000 > payload.exp : false
    })
    
    return { 
      valid: true, 
      header, 
      payload,
      isExpired: payload.exp ? Date.now() / 1000 > payload.exp : false
    }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

// Helper function to get server URL
const getServerUrl = () => {
  return `https://${projectId}.supabase.co/functions/v1/make-server-6ad03eec`
}

// Helper function to get auth headers (always include some form of authorization for Supabase Edge Functions)
const getAuthHeaders = (accessToken?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  // Always include authorization - use access token if provided, otherwise use anon key
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  } else {
    headers['Authorization'] = `Bearer ${publicAnonKey}`
  }
  
  return headers
}

// Helper function to make requests to the server
export const serverRequest = async (
  endpoint: string, 
  options: RequestInit = {}, 
  accessToken?: string
) => {
  const url = `${getServerUrl()}${endpoint}`
  
  const config: RequestInit = {
    ...options,
    headers: {
      ...getAuthHeaders(accessToken),
      ...options.headers,
    },
  }
  
  console.log(`🌐 Making server request: ${config.method || 'GET'} ${url}`)
  console.log(`🔑 Using auth token: ${(accessToken || publicAnonKey).substring(0, 20)}...`)
  
  try {
    const response = await fetch(url, config)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: `Request failed with status ${response.status}: ${response.statusText}` 
      }))
      console.error(`❌ Server request failed:`, {
        url,
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      throw new Error(errorData.error || errorData.message || `Server request failed: ${response.status}`)
    }
    
    const result = await response.json()
    console.log(`✅ Server request successful: ${url}`, result)
    return result
  } catch (error) {
    console.error(`❌ Server request failed: ${url}`, error)
    throw error
  }
}

// Simple ping test (uses anon key as required by Supabase Edge Functions)
export const pingServer = async () => {
  try {
    const url = `${getServerUrl()}/ping`
    console.log(`🏓 Pinging server: ${url}`)
    console.log(`🔑 Using anon key: ${publicAnonKey.substring(0, 30)}...`)
    console.log(`🔑 Full anon key: ${publicAnonKey}`)
    console.log(`🔑 Anon key length: ${publicAnonKey.length}`)
    
    // Validate token expiry
    try {
      const parts = publicAnonKey.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        console.log(`🔑 Token payload:`, payload)
        if (payload.exp) {
          const isExpired = Date.now() / 1000 > payload.exp
          const expiresAt = new Date(payload.exp * 1000).toISOString()
          console.log(`🔑 Token expires: ${expiresAt} (expired: ${isExpired})`)
          if (isExpired) {
            console.error('❌ Token is expired!')
            return { success: false, error: 'JWT token is expired' }
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not validate token expiry:', error)
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}` // Always include auth for Supabase Edge Functions
      },
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: `Ping failed: ${response.status}` 
      }))
      console.error('❌ Ping failed with error:', errorData)
      throw new Error(errorData.error || `Ping failed: ${response.status}`)
    }
    
    const result = await response.json()
    console.log('✅ Server ping successful:', result)
    return { success: true, data: result }
  } catch (error) {
    console.error('❌ Server ping failed:', error)
    return { success: false, error: error.message }
  }
}

// Check server status (uses anon key as required by Supabase Edge Functions)
export const checkServerStatus = async () => {
  try {
    const url = `${getServerUrl()}/status`
    console.log(`📊 Checking server status with anon key: ${url}`)
    console.log(`🔑 Using anon key: ${publicAnonKey.substring(0, 30)}...`)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}` // Always include auth for Supabase Edge Functions
      },
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: `Status check failed: ${response.status}` 
      }))
      console.error('❌ Status check failed:', errorData)
      throw new Error(errorData.error || `Status check failed: ${response.status}`)
    }
    
    const result = await response.json()
    console.log('✅ Server status check successful:', result)
    return result
  } catch (error) {
    console.error('Server status check failed:', error)
    return { 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}

// Debug JWT issues (public endpoint)
export const debugJWT = async () => {
  try {
    const url = `${getServerUrl()}/debug-jwt`
    console.log(`🐛 Debugging JWT with anon key: ${url}`)
    console.log(`🔑 Anon key: ${publicAnonKey.substring(0, 20)}...`)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}` // Send anon key to debug
      },
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: `Debug failed: ${response.status}` 
      }))
      console.error('❌ JWT debug failed:', errorData)
      return { success: false, error: errorData }
    }
    
    const result = await response.json()
    console.log('🔍 JWT Debug result:', result)
    return { success: true, data: result }
  } catch (error) {
    console.error('❌ JWT debug failed:', error)
    return { success: false, error: error.message }
  }
}

// Debug WECYCLE_KEY issues (no auth required)
export const debugWecycleKey = async () => {
  try {
    const url = `${getServerUrl()}/debug-wecycle-key`
    console.log(`🔍 Debugging WECYCLE_KEY: ${url}`)
    console.log('🔍 This endpoint requires NO authentication')
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
        // Explicitly NO Authorization header - this endpoint doesn't require auth
      },
    })
    
    console.log(`🔍 Response status: ${response.status}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: `WECYCLE_KEY debug failed: ${response.status} ${response.statusText}` 
      }))
      console.error('❌ WECYCLE_KEY debug failed:', errorData)
      return { success: false, error: errorData }
    }
    
    const result = await response.json()
    console.log('🔍 WECYCLE_KEY Debug result:', result)
    
    // If there are issues, log them clearly
    if (result.potentialIssues && result.potentialIssues.length > 0) {
      console.error('❌ WECYCLE_KEY Issues found:', result.potentialIssues)
      console.log('💡 Suggestion:', result.suggestion)
      if (result.correctFormat) {
        console.log('✅ Correct format:', result.correctFormat)
      }
      if (result.instructions) {
        console.log('📋 Instructions:', result.instructions)
      }
    }
    
    return { success: true, data: result }
  } catch (error) {
    console.error('❌ WECYCLE_KEY debug failed:', error)
    return { success: false, error: error.message }
  }
}

// Helper function to upload files to the server
export const uploadToServer = async (
  endpoint: string,
  file: File,
  accessToken?: string,
  additionalData?: Record<string, any>
) => {
  const url = `${getServerUrl()}${endpoint}`
  
  const formData = new FormData()
  formData.append('file', file)
  
  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, typeof value === 'string' ? value : JSON.stringify(value))
    })
  }
  
  const headers: Record<string, string> = {}
  // Always include authorization for file uploads
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  } else {
    headers['Authorization'] = `Bearer ${publicAnonKey}`
  }
  
  console.log(`📁 Uploading file to server: POST ${url}`)
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }))
      throw new Error(errorData.error || `Upload failed: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error(`❌ Upload failed: ${url}`, error)
    throw error
  }
}

// Health check function (protected endpoint, uses anon key)
export const checkServerHealth = async () => {
  try {
    console.log(`🏥 Checking server health with anon key: ${publicAnonKey.substring(0, 20)}...`)
    return await serverRequest('/health') // Will use anon key by default
  } catch (error) {
    console.error('Server health check failed:', error)
    return { 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}

// Configuration check function (protected endpoint, uses anon key)
export const checkServerConfig = async () => {
  try {
    console.log(`🔧 Checking server config with anon key: ${publicAnonKey.substring(0, 20)}...`)
    return await serverRequest('/config') // Will use anon key by default
  } catch (error) {
    console.error('Server config check failed:', error)
    return { 
      configured: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}

// Authenticated server request helper (uses user access token)
export const authenticatedServerRequest = async (
  endpoint: string,
  options: RequestInit = {},
  accessToken: string
) => {
  if (!accessToken) {
    throw new Error('Access token is required for authenticated requests')
  }
  return await serverRequest(endpoint, options, accessToken)
}

// Test server connectivity with comprehensive checks
export const testServerConnection = async () => {
  try {
    console.log(`🧪 Testing server connection...`)
    console.log(`   - Project ID: ${projectId}`)
    console.log(`   - Server URL: ${getServerUrl()}`)
    console.log(`   - Anon Key: ${publicAnonKey.substring(0, 30)}...`)
    console.log(`   - Anon Key Length: ${publicAnonKey.length}`)
    
    // First test JWT token structure
    console.log('🔍 Step 0: Testing JWT token structure...')
    const tokenTest = testJWTToken()
    console.log('JWT Test result:', tokenTest)
    
    if (!tokenTest.valid || tokenTest.isExpired) {
      return { 
        success: false, 
        error: `Invalid or expired JWT: ${tokenTest.error || 'Token expired'}`, 
        step: 'jwt-validation',
        tokenTest 
      }
    }
    
    // First try simple ping
    console.log('🏓 Step 1: Testing ping endpoint...')
    const pingResult = await pingServer()
    if (!pingResult.success) {
      return { success: false, error: `Ping failed: ${pingResult.error}`, step: 'ping' }
    }
    
    // Then try status endpoint
    console.log('📊 Step 2: Testing status endpoint...')
    const statusResult = await checkServerStatus()
    if (statusResult.status === 'error') {
      return { success: false, error: `Status check failed: ${statusResult.error}`, step: 'status' }
    }
    
    // Debug JWT before trying protected endpoints
    console.log('🐛 Step 3: Debugging JWT for protected endpoints...')
    const jwtDebug = await debugJWT()
    console.log('JWT Debug result:', jwtDebug)
    
    // Finally try protected endpoint (root)
    console.log('🔍 Step 4: Testing protected endpoint...')
    try {
      const rootResult = await serverRequest('/')
      console.log('✅ Server connection test successful:', { 
        tokenTest,
        ping: pingResult.data, 
        status: statusResult, 
        jwtDebug: jwtDebug.data,
        root: rootResult 
      })
      return { success: true, data: { tokenTest, ping: pingResult.data, status: statusResult, jwtDebug: jwtDebug.data, root: rootResult } }
    } catch (rootError) {
      console.warn('⚠️ Protected endpoint failed, but public endpoints work:', rootError.message)
      return { 
        success: true, 
        data: { tokenTest, ping: pingResult.data, status: statusResult, jwtDebug: jwtDebug.data }, 
        warning: `Protected endpoints failed: ${rootError.message}` 
      }
    }
  } catch (error) {
    console.error('❌ Server connection test failed:', error)
    return { success: false, error: error.message, step: 'unknown' }
  }
}

// Diagnose connection issues
export const diagnoseConnection = async () => {
  const results = {
    projectId,
    serverUrl: getServerUrl(),
    anonKey: publicAnonKey.substring(0, 20) + '...',
    tests: {}
  }
  
  try {
    // Test 1: Simple ping (no auth)
    console.log('🔍 Diagnosis Test 1: Simple ping (no auth)...')
    const pingResult = await pingServer()
    results.tests['ping'] = pingResult
    
    // Test 2: Status check (no auth)
    console.log('🔍 Diagnosis Test 2: Status check (no auth)...')
    try {
      const statusResult = await checkServerStatus()
      results.tests['status'] = { success: statusResult.status !== 'error', data: statusResult }
    } catch (error) {
      results.tests['status'] = { success: false, error: error.message }
    }
    
    // Test 3: JWT Debug
    console.log('🔍 Diagnosis Test 3: JWT Debug...')
    try {
      const jwtResult = await debugJWT()
      results.tests['jwt'] = jwtResult
    } catch (error) {
      results.tests['jwt'] = { success: false, error: error.message }
    }
    
    // Test 4: Health check (protected)
    console.log('🔍 Diagnosis Test 4: Health check (protected)...')
    try {
      const healthResult = await checkServerHealth()
      results.tests['health'] = { success: healthResult.status === 'ok', data: healthResult }
    } catch (error) {
      results.tests['health'] = { success: false, error: error.message }
    }
    
    // Test 5: Config check (protected)
    console.log('🔍 Diagnosis Test 5: Config check (protected)...')
    try {
      const configResult = await checkServerConfig()
      results.tests['config'] = { success: !configResult.error, data: configResult }
    } catch (error) {
      results.tests['config'] = { success: false, error: error.message }
    }
    
    console.log('🔍 Connection diagnosis complete:', results)
    return results
  } catch (error) {
    console.error('❌ Connection diagnosis failed:', error)
    results.tests['diagnosis'] = { success: false, error: error.message }
    return results
  }
}