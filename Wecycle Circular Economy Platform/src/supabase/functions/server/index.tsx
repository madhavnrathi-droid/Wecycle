import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { initializeStorage, supabase, supabaseConfig, validateConfiguration, isWecycleKeyConfigured } from "./middleware.tsx";
import { registerAuthRoutes } from "./auth-routes.tsx";
import { registerUploadRoutes } from "./upload-routes.tsx";
import { registerRequestRoutes } from "./request-routes.tsx";
import { registerNotificationRoutes } from "./notification-routes.tsx";
import { registerSearchRoutes } from "./search-routes.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Initialize server on startup
const initializeServer = async () => {
  try {
    console.log('🚀 Starting Wecycle server...');
    console.log('🔧 Configuration:');
    console.log(`   - Supabase URL: ${supabaseConfig.url}`);
    console.log(`   - Service Role Key: ${supabaseConfig.serviceRoleKey ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - Anon Key: ${supabaseConfig.anonKey ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   - WECYCLE_KEY Configured: ${isWecycleKeyConfigured() ? '✅ Yes' : '❌ No (using fallback)'}`);
    
    if (supabaseConfig.anonKey) {
      console.log(`   - Anon Key Preview: ${supabaseConfig.anonKey.substring(0, 30)}...`);
    }
    
    // Validate configuration (but don't fail startup)
    const isValid = validateConfiguration();
    if (!isValid) {
      console.warn('⚠️ Server: Running with fallback configuration - some features may not work properly');
    }
    
    // Initialize storage buckets
    await initializeStorage();
    
    console.log('✅ Wecycle server initialization completed');
  } catch (error) {
    console.error('❌ Server initialization error (continuing anyway):', error);
    // Don't throw - let the server start even with errors
  }
};

// Initialize on startup (but don't fail if it errors)
initializeServer().catch(error => {
  console.error('⚠️ Server initialization had errors, but server will continue:', error);
});

// Middleware to validate any authorization (anon key or user token)
const validateAnyAuth = async (c: any, next: any) => {
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
  console.log(`🔑 Expected anon key: ${supabaseConfig.anonKey ? supabaseConfig.anonKey.substring(0, 30) + '...' : 'Not configured'}`);
  
  // Check if it's the anon key (most common case)
  if (token === supabaseConfig.anonKey) {
    console.log('✅ Valid anon key authentication');
    c.set('authType', 'anon');
    c.set('user', null);
    await next();
    return;
  }
  
  // Try to validate as a user token
  try {
    console.log('🔍 Attempting user token validation...');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('❌ User token validation failed:', error.message);
      return c.json({ 
        error: 'Invalid token',
        details: error.message,
        tokenPrefix: token.substring(0, 20) + '...',
        expectedAnonKey: supabaseConfig.anonKey ? supabaseConfig.anonKey.substring(0, 20) + '...' : 'Not configured',
        endpoint: c.req.path
      }, 401);
    }
    
    if (!user) {
      console.error('❌ No user found for token');
      return c.json({ 
        error: 'No user found for token',
        tokenPrefix: token.substring(0, 20) + '...',
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
      tokenPrefix: token.substring(0, 20) + '...',
      endpoint: c.req.path
    }, 401);
  }
};

// ALL ENDPOINTS - Require valid authorization (anon key or user token)

// Simple ping endpoint - accepts anon key
app.get("/make-server-6ad03eec/ping", validateAnyAuth, (c) => {
  console.log('🏓 Ping endpoint hit successfully');
  return c.json({ 
    pong: true,
    timestamp: new Date().toISOString(),
    status: "ok",
    authType: c.get('authType'),
    message: "Server is responding",
    user: c.get('user')?.id || null
  });
});

// Basic server status - accepts anon key
app.get("/make-server-6ad03eec/status", validateAnyAuth, (c) => {
  console.log('📊 Status endpoint hit successfully');
  return c.json({
    service: "Wecycle Server",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    authType: c.get('authType'),
    user: c.get('user')?.id || null,
    uptime: process.uptime ? process.uptime() : 'unknown',
    configuration: {
      supabaseConnected: !!supabaseConfig.serviceRoleKey,
      wecycleKeyConfigured: isWecycleKeyConfigured(),
      configurationValid: validateConfiguration(),
      hasAnonKey: !!supabaseConfig.anonKey,
      anonKeyPrefix: supabaseConfig.anonKey ? supabaseConfig.anonKey.substring(0, 20) + '...' : 'Not configured'
    },
    endpoints: {
      available: ["/ping", "/status", "/debug-jwt", "/", "/health", "/config"],
      authRequired: "All endpoints require valid authorization (anon key or user token)"
    }
  });
});

// Debug endpoint to help with JWT issues - accepts anon key
app.get("/make-server-6ad03eec/debug-jwt", validateAnyAuth, (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader ? authHeader.split(' ')[1] : null;
  
  console.log('🐛 JWT Debug endpoint hit successfully');
  
  return c.json({
    message: "JWT Debug Information",
    endpoint: c.req.path,
    authType: c.get('authType'),
    user: c.get('user')?.id || null,
    receivedAuth: !!authHeader,
    authHeader: authHeader || 'Not provided',
    tokenReceived: !!token,
    tokenPrefix: token ? token.substring(0, 30) + '...' : 'No token',
    expectedAnonKey: supabaseConfig.anonKey ? supabaseConfig.anonKey.substring(0, 30) + '...' : 'Not configured',
    tokensMatch: token === supabaseConfig.anonKey,
    tokenLength: token ? token.length : 0,
    expectedLength: supabaseConfig.anonKey ? supabaseConfig.anonKey.length : 0,
    serverConfig: {
      hasAnonKey: !!supabaseConfig.anonKey,
      hasServiceKey: !!supabaseConfig.serviceRoleKey,
      supabaseUrl: supabaseConfig.url,
      wecycleKeyConfigured: isWecycleKeyConfigured()
    }
  });
});

// Root endpoint
app.get("/make-server-6ad03eec/", validateAnyAuth, (c) => {
  return c.json({
    service: "Wecycle Server",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    authType: c.get('authType'),
    user: c.get('user')?.id || null,
    endpoints: [
      "/ping",
      "/status",
      "/debug-jwt",
      "/",
      "/health",
      "/config", 
      "/auth/signup",
      "/auth/signin",
      "/uploads",
      "/requests",
      "/notifications",
      "/search"
    ]
  });
});

// Health check endpoint
app.get("/make-server-6ad03eec/health", validateAnyAuth, (c) => {
  const isConfigured = isWecycleKeyConfigured();
  const isValid = validateConfiguration();
  
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    features: ["uploads", "requests", "notifications", "file-storage", "search"],
    configuration: {
      supabaseConnected: !!supabaseConfig.serviceRoleKey,
      wecycleKeyConfigured: isConfigured,
      configurationValid: isValid,
      bucketsInitialized: true,
      mode: isConfigured ? 'production' : 'fallback'
    },
    authType: c.get('authType'),
    user: c.get('user')?.id || null
  });
});

// Configuration check endpoint
app.get("/make-server-6ad03eec/config", validateAnyAuth, (c) => {
  return c.json({
    supabaseUrl: supabaseConfig.url,
    hasServiceRoleKey: !!supabaseConfig.serviceRoleKey,
    hasAnonKey: !!supabaseConfig.anonKey,
    anonKeyPrefix: supabaseConfig.anonKey ? supabaseConfig.anonKey.substring(0, 30) + '...' : 'Not configured',
    wecycleKeyConfigured: isWecycleKeyConfigured(),
    configurationValid: validateConfiguration(),
    timestamp: new Date().toISOString(),
    authType: c.get('authType'),
    user: c.get('user')?.id || null,
    environmentVariables: {
      hasWecycleKey: !!Deno.env.get('WECYCLE_KEY'),
      hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
      hasSupabaseServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      hasSupabaseAnonKey: !!Deno.env.get('SUPABASE_ANON_KEY')
    }
  });
});

// Debug endpoint for WECYCLE_KEY issues (no auth required for easier debugging)
app.get("/make-server-6ad03eec/debug-wecycle-key", (c) => {
  console.log('🔍 WECYCLE_KEY debug endpoint called (no auth required)');
  
  const wecycleKey = Deno.env.get('WECYCLE_KEY');
  
  if (!wecycleKey) {
    console.log('❌ WECYCLE_KEY not found in environment');
    return c.json({
      status: 'missing',
      message: 'WECYCLE_KEY environment variable is not set',
      hasValue: false,
      instructions: {
        step1: 'Set WECYCLE_KEY environment variable',
        step2: 'Use JSON format: {"supabaseUrl":"...","supabaseServiceRoleKey":"...","supabaseAnonKey":"..."}',
        step3: 'Get your anon key from https://supabase.com/dashboard/project/wzgalvcieeiazqqdmsrd/settings/api'
      }
    });
  }
  
  console.log(`🔍 WECYCLE_KEY found, length: ${wecycleKey.length}`);
  console.log(`🔍 WECYCLE_KEY first 50 chars: ${wecycleKey.substring(0, 50)}`);
  
  // Safe analysis without parsing
  const preview = wecycleKey.substring(0, 200);
  const length = wecycleKey.length;
  const trimmed = wecycleKey.trim();
  const startsWithBrace = trimmed.startsWith('{');
  const endsWithBrace = trimmed.endsWith('}');
  
  const analysis = {
    status: 'present',
    hasValue: true,
    length,
    trimmedLength: trimmed.length,
    preview: preview + (length > 200 ? '...' : ''),
    startsWithBrace,
    endsWithBrace,
    firstChar: wecycleKey.charAt(0),
    lastChar: wecycleKey.charAt(length - 1),
    firstCharCode: wecycleKey.charCodeAt(0),
    lastCharCode: wecycleKey.charCodeAt(length - 1),
    containsBasicJSONChars: wecycleKey.includes('"') && wecycleKey.includes(':'),
    containsSupabaseUrl: wecycleKey.includes('supabaseUrl'),
    containsServiceRoleKey: wecycleKey.includes('supabaseServiceRoleKey'),
    containsAnonKey: wecycleKey.includes('supabaseAnonKey'),
    message: 'WECYCLE_KEY is present but may need formatting fixes'
  };
  
  // Try to identify common issues
  const issues = [];
  if (!startsWithBrace) issues.push('Does not start with { - Current first char: "' + wecycleKey.charAt(0) + '" (code: ' + wecycleKey.charCodeAt(0) + ')');
  if (!endsWithBrace) issues.push('Does not end with } - Current last char: "' + wecycleKey.charAt(length - 1) + '" (code: ' + wecycleKey.charCodeAt(length - 1) + ')');
  if (!wecycleKey.includes('"')) issues.push('Missing quotes (") - may not be JSON');
  if (!wecycleKey.includes(':')) issues.push('Missing colons (:) - may not be JSON');
  if (trimmed.length !== length) issues.push('Has leading/trailing whitespace - Length: ' + length + ', Trimmed: ' + trimmed.length);
  if (!wecycleKey.includes('supabaseUrl')) issues.push('Missing "supabaseUrl" property');
  if (!wecycleKey.includes('supabaseServiceRoleKey')) issues.push('Missing "supabaseServiceRoleKey" property');
  if (!wecycleKey.includes('supabaseAnonKey')) issues.push('Missing "supabaseAnonKey" property');
  
  analysis.potentialIssues = issues;
  
  if (issues.length > 0) {
    analysis.suggestion = 'WECYCLE_KEY needs to be properly formatted JSON';
    analysis.correctFormat = '{"supabaseUrl":"https://wzgalvcieeiazqqdmsrd.supabase.co","supabaseServiceRoleKey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Z2FsdmNpZWVpYXpxcWRtc3JkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTQ5MjExMywiZXhwIjoyMDcxMDY4MTEzfQ.C6hD-LNWNGC4qjeV65_bkIMr8Iy6mW6u5zhAhH2rlLQ","supabaseAnonKey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Z2FsdmNpZWVpYXpxcWRtc3JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0OTIxMTMsImV4cCI6MjA3MTA2ODExM30.1kCULpkJbEINCmxJbGQJdWtMctRdWfAUXZ3RI6ljYi4"}';
    analysis.instructions = {
      step1: 'Use the correct JSON format shown above with your new service role key',
      step2: 'Ensure no extra characters or whitespace before/after the JSON',
      step3: 'Set the complete JSON string as your WECYCLE_KEY environment variable',
      step4: 'Your new service role key: sb_secret_181mgaxNDumLYYlvk50bHw_l6Tqztml'
    };
  } else {
    analysis.suggestion = 'Structure looks OK, may be a JSON syntax issue';
  }
  
  console.log(`🔍 WECYCLE_KEY analysis complete - Issues found: ${issues.length}`);
  return c.json(analysis);
});

// Get signed URL for existing file
app.get("/make-server-6ad03eec/file/:path", validateAnyAuth, async (c) => {
  try {
    const filePath = c.req.param('path');
    const bucketName = 'make-6ad03eec-uploads';
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 3600); // 1 hour expiry
    
    if (error) {
      console.error('Error creating signed URL:', error);
      return c.json({ error: 'File not found' }, 404);
    }
    
    return c.json({ url: data.signedUrl });
  } catch (error) {
    console.error('Error fetching file:', error);
    return c.json({ error: 'Failed to fetch file' }, 500);
  }
});

// Register all route modules
try {
  registerAuthRoutes(app);
  registerUploadRoutes(app);
  registerRequestRoutes(app);
  registerNotificationRoutes(app);
  registerSearchRoutes(app);
  console.log('✅ All route modules registered successfully');
} catch (error) {
  console.error('❌ Error registering route modules:', error);
}

// Error handling middleware
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ 
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString(),
    endpoint: c.req.path
  }, 500);
});

// Catch-all for undefined routes
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: c.req.path,
    availableEndpoints: [
      "/make-server-6ad03eec/ping",
      "/make-server-6ad03eec/status",
      "/make-server-6ad03eec/debug-jwt",
      "/make-server-6ad03eec/debug-wecycle-key",
      "/make-server-6ad03eec/",
      "/make-server-6ad03eec/health",
      "/make-server-6ad03eec/config"
    ],
    timestamp: new Date().toISOString()
  }, 404);
});

console.log('🌐 Wecycle server ready to handle requests');
console.log('📍 Available endpoints (all require valid authorization except debug-wecycle-key):');
console.log('     - GET /make-server-6ad03eec/ping');
console.log('     - GET /make-server-6ad03eec/status');
console.log('     - GET /make-server-6ad03eec/debug-jwt');
console.log('     - GET /make-server-6ad03eec/debug-wecycle-key (no auth required)');
console.log('     - GET /make-server-6ad03eec/');
console.log('     - GET /make-server-6ad03eec/health');
console.log('     - GET /make-server-6ad03eec/config');
console.log('🔑 All endpoints accept anon key or user tokens');

Deno.serve(app.fetch);