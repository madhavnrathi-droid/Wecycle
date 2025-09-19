import { createClient } from "npm:@supabase/supabase-js";

// Helper function to clean and validate WECYCLE_KEY
const cleanWecycleKey = (rawKey: string): string => {
  // Remove common problematic characters
  let cleaned = rawKey.trim();
  
  // Remove any BOM (Byte Order Mark) characters
  cleaned = cleaned.replace(/^\uFEFF/, '');
  
  // Remove any non-printable characters at start/end
  cleaned = cleaned.replace(/^[\x00-\x1F\x7F-\x9F]+|[\x00-\x1F\x7F-\x9F]+$/g, '');
  
  return cleaned;
};

// Helper function to validate basic JSON structure
const validateBasicJSON = (str: string): { valid: boolean; error?: string } => {
  if (!str || typeof str !== 'string') {
    return { valid: false, error: 'Empty or non-string value' };
  }
  
  if (!str.startsWith('{') || !str.endsWith('}')) {
    return { valid: false, error: 'Does not start with { or end with }' };
  }
  
  // Basic check for balanced braces
  let braceCount = 0;
  for (const char of str) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
  }
  
  if (braceCount !== 0) {
    return { valid: false, error: 'Unbalanced braces' };
  }
  
  return { valid: true };
};

// Function to get Supabase configuration from WECYCLE_KEY or environment variables
const getSupabaseConfig = () => {
  console.log('🔧 Server: Attempting to load Supabase configuration...');
  
  // First, try to get credentials from WECYCLE_KEY (preferred method)
  const wecycleKey = Deno.env.get('WECYCLE_KEY');
  console.log(`🔍 WECYCLE_KEY present: ${!!wecycleKey}`);
  
  if (wecycleKey) {
    try {
      console.log('🔍 Raw WECYCLE_KEY value (first 100 chars):', wecycleKey.substring(0, 100));
      console.log('🔍 WECYCLE_KEY length:', wecycleKey.length);
      console.log('🔍 WECYCLE_KEY character codes at start:', 
        wecycleKey.substring(0, 10).split('').map((c, i) => `${i}:'${c}'(${c.charCodeAt(0)})`).join(' '));
      console.log('🔍 WECYCLE_KEY character codes at end:', 
        wecycleKey.substring(Math.max(0, wecycleKey.length - 10)).split('').map((c, i) => `${i}:'${c}'(${c.charCodeAt(0)})`).join(' '));
      
      // Clean the key before parsing
      const cleanedKey = cleanWecycleKey(wecycleKey);
      if (cleanedKey !== wecycleKey) {
        console.log('🧹 Cleaned WECYCLE_KEY (removed extra characters)');
        console.log('🔍 Cleaned length:', cleanedKey.length);
      }
      
      // Validate basic JSON structure
      const validation = validateBasicJSON(cleanedKey);
      if (!validation.valid) {
        console.error('❌ WECYCLE_KEY basic validation failed:', validation.error);
        console.log('🔍 Cleaned WECYCLE_KEY preview:', cleanedKey.substring(0, 200));
        throw new Error(`Invalid JSON structure: ${validation.error}`);
      }
      
      const config = JSON.parse(cleanedKey);
      console.log('📝 Parsed WECYCLE_KEY:', {
        hasUrl: !!config.supabaseUrl,
        hasServiceKey: !!config.supabaseServiceRoleKey,
        hasAnonKey: !!config.supabaseAnonKey,
        urlPreview: config.supabaseUrl ? config.supabaseUrl.substring(0, 30) + '...' : 'missing'
      });
      
      if (config.supabaseUrl && config.supabaseServiceRoleKey && config.supabaseAnonKey) {
        console.log('✅ Server: Successfully parsed WECYCLE_KEY configuration');
        return {
          url: config.supabaseUrl,
          serviceRoleKey: config.supabaseServiceRoleKey,
          anonKey: config.supabaseAnonKey
        };
      } else {
        console.error('❌ Server: WECYCLE_KEY missing required fields');
        console.log('🔧 Found WECYCLE_KEY fields:', {
          hasUrl: !!config.supabaseUrl,
          hasServiceKey: !!config.supabaseServiceRoleKey,
          hasAnonKey: !!config.supabaseAnonKey,
          missingFields: [
            !config.supabaseUrl && 'supabaseUrl',
            !config.supabaseServiceRoleKey && 'supabaseServiceRoleKey', 
            !config.supabaseAnonKey && 'supabaseAnonKey'
          ].filter(Boolean)
        });
        console.log('💡 Required WECYCLE_KEY format (set as environment variable):');
        console.log('{"supabaseUrl":"https://wzgalvcieeiazqqdmsrd.supabase.co","supabaseServiceRoleKey":"sb_secret_181mgaxNDumLYYlvk50bHw_l6Tqztml","supabaseAnonKey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Z2FsdmNpZWVpYXpxcWRtc3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0OTIxMTMsImV4cCI6MjA3MTA2ODExM30.1kCULpkJbEINCmxJbGQJdWtMctRdWfAUXZ3RI6ljYi4"}');
      }
    } catch (error) {
      console.error('❌ Server: Failed to parse WECYCLE_KEY as JSON:', error);
      console.log('🔍 WECYCLE_KEY content preview:', wecycleKey.substring(0, 200) + (wecycleKey.length > 200 ? '...' : ''));
      console.log('🔍 WECYCLE_KEY starts with:', JSON.stringify(wecycleKey.substring(0, 20)));
      console.log('🔍 WECYCLE_KEY ends with:', JSON.stringify(wecycleKey.substring(Math.max(0, wecycleKey.length - 20))));
      console.log('💡 WECYCLE_KEY must be valid JSON. Check for:');
      console.log('   - Extra spaces or characters before/after JSON');
      console.log('   - Unescaped quotes in values');
      console.log('   - Missing quotes around property names');
      console.log('   - Line breaks in the middle of the JSON');
      console.log('✅ Correct format example:');
      console.log('{"supabaseUrl":"https://wzgalvcieeiazqqdmsrd.supabase.co","supabaseServiceRoleKey":"eyJ...","supabaseAnonKey":"eyJ..."}');
    }
  } else {
    console.log('💡 WECYCLE_KEY not set - using fallback configuration');
  }

  // Fallback to individual environment variables
  const envUrl = Deno.env.get('SUPABASE_URL');
  const envServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const envAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  console.log('🔍 Individual env vars:', {
    hasUrl: !!envUrl,
    hasServiceKey: !!envServiceKey,
    hasAnonKey: !!envAnonKey
  });

  if (envUrl && envServiceKey && envAnonKey) {
    console.log('✅ Server: Using individual environment variables');
    return {
      url: envUrl,
      serviceRoleKey: envServiceKey,
      anonKey: envAnonKey
    };
  }

  // Final fallback to valid configuration for this project
  console.warn('⚠️ Server: Using updated valid fallback configuration for wzgalvcieeiazqqdmsrd project');
  console.log('💡 To eliminate this warning, set WECYCLE_KEY environment variable with proper Supabase configuration');
  const fallbackConfig = {
    url: 'https://wzgalvcieeiazqqdmsrd.supabase.co',
    // User's new custom service role key
    serviceRoleKey: 'sb_secret_181mgaxNDumLYYlvk50bHw_l6Tqztml',
    // User's actual anon key
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Z2FsdmNpZWVpYXpxcWRtc3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0OTIxMTMsImV4cCI6MjA3MTA2ODExM30.1kCULpkJbEINCmxJbGQJdWtMctRdWfAUXZ3RI6ljYi4'
  };
  
  console.log('🔑 Fallback anon key preview:', fallbackConfig.anonKey.substring(0, 50) + '...');
  return fallbackConfig;
};

// Get configuration
let config;
try {
  config = getSupabaseConfig();
  console.log('✅ Server configuration loaded successfully');
  console.log('🔑 Final anon key preview:', config.anonKey ? config.anonKey.substring(0, 50) + '...' : 'Not configured');
} catch (error) {
  console.error('❌ Fatal error getting Supabase config:', error);
  // Use hardcoded fallback with user's credentials
  config = {
    url: 'https://wzgalvcieeiazqqdmsrd.supabase.co',
    serviceRoleKey: 'sb_secret_181mgaxNDumLYYlvk50bHw_l6Tqztml',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Z2FsdmNpZWVpYXpxcWRtc3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0OTIxMTMsImV4cCI6MjA3MTA2ODExM30.1kCULpkJbEINCmxJbGQJdWtMctRdWfAUXZ3RI6ljYi4'
  };
}

// Initialize Supabase client with service role key for admin operations
export const supabase = createClient(config.url, config.serviceRoleKey, {
  global: {
    headers: {
      'x-application-name': 'wecycle-server'
    }
  }
});

// Also create an anon client for validation
const anonClient = createClient(config.url, config.anonKey, {
  global: {
    headers: {
      'x-application-name': 'wecycle-server-anon'
    }
  }
});

// Export configuration for other modules
export const supabaseConfig = config;

// Storage initialization with improved error handling
export const initializeStorage = async () => {
  try {
    console.log('🚀 Initializing Supabase storage buckets...');
    
    const buckets = [
      {
        name: 'make-6ad03eec-uploads',
        options: {
          public: false,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          fileSizeLimit: 10485760 // 10MB for uploads
        }
      },
      {
        name: 'make-6ad03eec-reference-images',
        options: {
          public: false,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
          fileSizeLimit: 3145728 // 3MB for reference images
        }
      }
    ];
    
    for (const bucket of buckets) {
      try {
        const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
        
        if (listError) {
          console.error(`Error listing buckets: ${listError.message}`);
          continue;
        }
        
        const bucketExists = existingBuckets?.some(b => b.name === bucket.name);
        
        if (!bucketExists) {
          const { error: createError } = await supabase.storage.createBucket(bucket.name, bucket.options);
          
          if (createError) {
            console.error(`❌ Failed to create storage bucket ${bucket.name}:`, createError);
          } else {
            console.log(`✅ Storage bucket ${bucket.name} created successfully`);
          }
        } else {
          console.log(`✅ Storage bucket ${bucket.name} already exists`);
        }
      } catch (error) {
        console.error(`Error handling bucket ${bucket.name}:`, error);
      }
    }
    
    console.log('✅ Storage initialization completed');
  } catch (error) {
    console.error('❌ Error initializing storage:', error);
  }
};

// Simple JWT validation function that doesn't require Supabase call
const isValidJWTFormat = (token: string): boolean => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    
    // Decode header and payload to check basic structure
    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    // Check if it looks like a Supabase JWT
    return !!(header.alg && payload.iss === 'supabase' && payload.ref);
  } catch {
    return false;
  }
};

// Enhanced auth validation middleware
export const validateAuth = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  console.log(`🔍 Auth validation - Header present: ${!!authHeader}`);
  
  if (!authHeader) {
    console.error('❌ No Authorization header provided');
    return c.json({ 
      error: 'Missing authorization header',
      hint: 'Include Authorization: Bearer <token>',
      endpoint: c.req.path
    }, 401);
  }
  
  const token = authHeader.split(' ')[1];
  if (!token) {
    console.error('❌ Invalid Authorization header format');
    return c.json({ 
      error: 'Invalid authorization header format',
      expected: 'Bearer <token>',
      received: authHeader,
      endpoint: c.req.path
    }, 401);
  }
  
  console.log(`🔑 Token received: ${token.substring(0, 30)}...`);
  console.log(`🔑 Expected anon key: ${config.anonKey ? config.anonKey.substring(0, 30) + '...' : 'Not configured'}`);
  
  // First check basic JWT format
  if (!isValidJWTFormat(token)) {
    console.error('❌ Invalid JWT format');
    return c.json({ 
      error: 'Invalid JWT format',
      tokenPrefix: token.substring(0, 20) + '...',
      endpoint: c.req.path
    }, 401);
  }
  
  // Check if it's the anon key (exact match)
  if (token === config.anonKey) {
    console.log('✅ Valid anon key authentication');
    c.set('authType', 'anon');
    c.set('user', null);
    await next();
    return;
  }
  
  // Try to validate as a user token using the anon client
  try {
    console.log('🔍 Attempting user token validation with anon client...');
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    
    if (error) {
      console.error('❌ User token validation failed:', error.message);
      return c.json({ 
        error: 'Invalid token',
        details: error.message,
        tokenPrefix: token.substring(0, 30) + '...',
        expectedAnonKey: config.anonKey ? config.anonKey.substring(0, 30) + '...' : 'Not configured',
        endpoint: c.req.path
      }, 401);
    }
    
    if (!user) {
      console.error('❌ No user found for token');
      return c.json({ 
        error: 'No user found for token',
        tokenPrefix: token.substring(0, 30) + '...',
        endpoint: c.req.path
      }, 401);
    }
    
    console.log('✅ Valid user token authentication:', user.id);
    c.set('authType', 'user');
    c.set('user', user);
    await next();
  } catch (error) {
    console.error('❌ Token validation error:', error);
    return c.json({ 
      error: 'Authentication failed',
      details: error.message,
      tokenPrefix: token.substring(0, 30) + '...',
      endpoint: c.req.path
    }, 401);
  }
};

// Helper function to validate configuration on startup
export const validateConfiguration = () => {
  try {
    const urlValid = config.url.startsWith('https://') && config.url.includes('.supabase.co');
    const serviceKeyValid = config.serviceRoleKey.length > 20 && config.serviceRoleKey.startsWith('eyJ');
    const anonKeyValid = config.anonKey.length > 20 && config.anonKey.startsWith('eyJ');

    const isValid = urlValid && serviceKeyValid && anonKeyValid;

    if (!isValid) {
      console.warn('⚠️ Server: Invalid Supabase configuration detected');
      console.log('Config validation details:', {
        urlValid,
        serviceKeyValid,
        anonKeyValid,
        anonKeyStatus: 'Invalid format'
      });
      
      console.log('🔑 Configuration validation failed. Required WECYCLE_KEY format:');
      console.log('   {"supabaseUrl":"https://wzgalvcieeiazqqdmsrd.supabase.co","supabaseServiceRoleKey":"eyJ...","supabaseAnonKey":"eyJ..."}');
      
      return false;
    }

    console.log('✅ Server: Supabase configuration validated successfully');
    return true;
  } catch (error) {
    console.error('❌ Server: Configuration validation failed:', error);
    return false;
  }
};

// Helper function to check if WECYCLE_KEY was properly configured
export const isWecycleKeyConfigured = () => {
  const wecycleKey = Deno.env.get('WECYCLE_KEY');
  if (!wecycleKey) return false;
  
  try {
    const config = JSON.parse(wecycleKey);
    return !!(config.supabaseUrl && config.supabaseServiceRoleKey && config.supabaseAnonKey);
  } catch {
    return false;
  }
};

// Validate configuration on module load (but don't throw)
const isValid = validateConfiguration();
console.log(`🔧 Server configuration status: ${isValid ? 'Valid' : 'Using fallback'}`);
console.log(`🔑 Server will accept anon key: ${config.anonKey ? config.anonKey.substring(0, 30) + '...' : 'Not configured'}`);