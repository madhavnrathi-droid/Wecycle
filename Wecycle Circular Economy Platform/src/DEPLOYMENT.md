# 🚀 Deployment Guide - Wecycle

Complete guide for deploying Wecycle to production environments.

## 📋 Pre-deployment Checklist

### ✅ Code Quality
- [ ] All TypeScript errors resolved
- [ ] No console.log statements in production code
- [ ] All imports are used and necessary
- [ ] Components are properly typed
- [ ] Error boundaries implemented
- [ ] Loading states for all async operations

### ✅ Configuration
- [ ] Supabase credentials configured
- [ ] Database schema applied
- [ ] Storage bucket created and configured
- [ ] RLS policies tested
- [ ] Authentication flows tested
- [ ] Real-time subscriptions working

### ✅ Performance
- [ ] Images optimized and properly sized
- [ ] Bundle size analyzed and optimized
- [ ] Lazy loading implemented where appropriate
- [ ] Database queries optimized with indexes
- [ ] Caching strategies in place

### ✅ Security
- [ ] Environment variables secured
- [ ] API keys not exposed in client code
- [ ] User input sanitized
- [ ] File upload restrictions in place
- [ ] CORS configured properly

## 🎯 Deployment Options

### 1. Vercel (Recommended)

**Why Vercel:**
- Optimized for React applications
- Automatic deployments from Git
- Built-in performance monitoring
- Global CDN distribution
- Serverless functions support

**Steps:**

1. **Prepare Repository**
   ```bash
   # Ensure clean git state
   git add .
   git commit -m "Production ready deployment"
   git push origin main
   ```

2. **Deploy to Vercel**
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Login and deploy
   vercel login
   vercel --prod
   ```

3. **Configure Environment Variables**
   - Go to Vercel Dashboard → Project Settings → Environment Variables
   - Add production variables:
     ```
     REACT_APP_SUPABASE_URL=your_production_url
     REACT_APP_SUPABASE_ANON_KEY=your_production_key
     ```

4. **Verify Deployment**
   - Check all routes load correctly
   - Test authentication flows
   - Verify real-time features
   - Test file uploads
   - Check mobile responsiveness

**Vercel Configuration** (`vercel.json`):
```json
{
  "functions": {
    "app/api/**/*.js": {
      "runtime": "@vercel/node"
    }
  },
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "*"
        }
      ]
    }
  ]
}
```

### 2. Netlify

**Why Netlify:**
- Excellent static site hosting
- Form handling capabilities
- Split testing support
- Deploy previews for branches

**Steps:**

1. **Build Configuration** (`netlify.toml`):
   ```toml
   [build]
     command = "npm run build"
     publish = "build"
   
   [build.environment]
     NODE_VERSION = "18"
   
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   
   [[headers]]
     for = "/api/*"
     [headers.values]
       Access-Control-Allow-Origin = "*"
   ```

2. **Deploy**
   - Connect GitHub repository in Netlify dashboard
   - Configure build settings
   - Add environment variables
   - Deploy automatically

### 3. AWS Amplify

**Why AWS Amplify:**
- Integrated with AWS ecosystem
- Built-in CI/CD pipeline
- Custom domain management
- Branch-based deployments

**Steps:**

1. **Create amplify.yml**:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm install
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: build
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
   ```

2. **Deploy**
   - Use AWS Amplify Console
   - Connect your repository
   - Configure environment variables
   - Deploy with automatic CI/CD

## 🗄️ Database Deployment

### Production Database Setup

1. **Create Production Supabase Project**
   ```bash
   # Create new project for production
   # Use different project from development
   ```

2. **Apply Schema**
   ```sql
   -- Run complete schema from /supabase/schema_sql.tsx
   -- Verify all tables, indexes, and policies are created
   ```

3. **Configure Storage**
   ```bash
   # Create 'images' bucket
   # Set to public access
   # Configure file size limits (10MB recommended)
   # Allow JPEG, PNG, WebP formats
   ```

4. **Test Connections**
   ```bash
   # Verify database connectivity
   # Test authentication flows
   # Check RLS policies
   # Verify storage uploads
   ```

### Database Migration Strategy

```sql
-- Version tracking for schema changes
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track current version
INSERT INTO schema_migrations (version) VALUES ('1.0.0');
```

## 🔒 Security Configuration

### Environment Variables

**Development** (`.env.local`):
```bash
REACT_APP_SUPABASE_URL=https://your-dev-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_dev_anon_key
```

**Production** (Platform Settings):
```bash
REACT_APP_SUPABASE_URL=https://your-prod-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_prod_anon_key
```

### Supabase Security

1. **API Settings**
   - Enable RLS on all tables
   - Configure JWT secret rotation
   - Set appropriate session timeout
   - Enable email confirmation

2. **Storage Security**
   ```sql
   -- Storage policies for images bucket
   CREATE POLICY "Users can upload images" ON storage.objects 
   FOR INSERT WITH CHECK (
     bucket_id = 'images' AND 
     auth.role() = 'authenticated'
   );

   CREATE POLICY "Anyone can view images" ON storage.objects 
   FOR SELECT USING (bucket_id = 'images');
   ```

## 📊 Monitoring & Analytics

### Error Tracking

**Sentry Integration** (Optional):
```bash
npm install @sentry/react
```

```typescript
// In App.tsx
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV
})
```

### Performance Monitoring

**Web Vitals Tracking**:
```typescript
// In index.tsx
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals'

function sendToAnalytics(metric: any) {
  // Send to your analytics service
  console.log(metric)
}

getCLS(sendToAnalytics)
getFID(sendToAnalytics)
getFCP(sendToAnalytics)
getLCP(sendToAnalytics)
getTTFB(sendToAnalytics)
```

## 🔧 Optimization Strategies

### Bundle Optimization

```bash
# Analyze bundle size
npm run build
npx bundlesize

# Check for unused dependencies
npx depcheck
```

### Image Optimization

```typescript
// Implement progressive image loading
const ImageWithFallback = ({ src, alt, className }) => {
  const [loaded, setLoaded] = useState(false)
  
  return (
    <div className={`relative ${className}`}>
      {!loaded && <div className="skeleton-loader" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}
```

### Database Optimization

```sql
-- Add missing indexes for production
CREATE INDEX CONCURRENTLY uploads_location_idx ON uploads USING gin(location gin_trgm_ops);
CREATE INDEX CONCURRENTLY requests_location_idx ON requests USING gin(location gin_trgm_ops);

-- Optimize frequent queries
CREATE INDEX uploads_active_recent_idx ON uploads(created_at DESC) 
WHERE status = 'active';
```

## 🚦 Post-deployment Testing

### Automated Testing Checklist

1. **Authentication Flow**
   - [ ] User signup works
   - [ ] Email verification working
   - [ ] Login/logout functionality
   - [ ] Password reset flow

2. **Core Features**
   - [ ] Upload materials with images
   - [ ] Create and respond to requests
   - [ ] Save/unsave items
   - [ ] Real-time notifications
   - [ ] Profile management

3. **Performance**
   - [ ] Page load times < 3 seconds
   - [ ] Image loading optimized
   - [ ] Mobile performance acceptable
   - [ ] Database queries fast

4. **Cross-browser Testing**
   - [ ] Chrome (latest)
   - [ ] Firefox (latest)
   - [ ] Safari (latest)
   - [ ] Mobile browsers

### Manual Testing Script

```bash
#!/bin/bash
echo "🧪 Running post-deployment tests..."

# Test main endpoints
curl -f https://your-app.vercel.app/ || exit 1
curl -f https://your-app.vercel.app/api/health || exit 1

# Test Supabase connection
# Add your specific API tests here

echo "✅ All tests passed!"
```

## 📱 Mobile Optimization

### Progressive Web App (PWA)

1. **Add manifest.json**:
   ```json
   {
     "name": "Wecycle - Circular Economy Platform",
     "short_name": "Wecycle",
     "description": "Share and discover reusable materials in your community",
     "start_url": "/",
     "display": "standalone",
     "theme_color": "#22c55e",
     "background_color": "#ffffff",
     "icons": [
       {
         "src": "/icon-192x192.png",
         "sizes": "192x192",
         "type": "image/png"
       },
       {
         "src": "/icon-512x512.png",
         "sizes": "512x512",
         "type": "image/png"
       }
     ]
   }
   ```

2. **Service Worker** (Optional for caching):
   ```javascript
   // In public/sw.js
   const CACHE_NAME = 'wecycle-v1'
   const urlsToCache = [
     '/',
     '/static/js/bundle.js',
     '/static/css/main.css'
   ]

   self.addEventListener('install', (event) => {
     event.waitUntil(
       caches.open(CACHE_NAME)
         .then((cache) => cache.addAll(urlsToCache))
     )
   })
   ```

## 📈 Scaling Considerations

### Database Scaling
- Monitor query performance
- Set up connection pooling
- Consider read replicas for high traffic
- Implement database migrations strategy

### CDN Strategy
- Use Supabase CDN for images
- Implement edge caching
- Optimize asset delivery

### Rate Limiting
```sql
-- Implement rate limiting in database
CREATE TABLE rate_limits (
  user_id UUID REFERENCES profiles(id),
  action_type TEXT,
  count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, action_type)
);
```

## 🆘 Troubleshooting

### Common Deployment Issues

1. **Environment Variables Not Loading**
   ```bash
   # Check variable names match exactly
   # Verify they're set in deployment platform
   # Restart deployment after adding variables
   ```

2. **Supabase Connection Errors**
   ```bash
   # Verify URL and key are correct
   # Check RLS policies allow operations
   # Ensure storage bucket exists and is public
   ```

3. **Build Failures**
   ```bash
   # Check TypeScript errors
   # Verify all dependencies installed
   # Check Node.js version compatibility
   ```

4. **Real-time Features Not Working**
   ```bash
   # Verify WebSocket connections allowed
   # Check Supabase real-time enabled
   # Confirm subscription filters correct
   ```

---

## 🎉 Launch Day Checklist

- [ ] All tests passing
- [ ] Performance metrics acceptable
- [ ] Error monitoring configured
- [ ] Analytics tracking active
- [ ] Documentation updated
- [ ] Team trained on production environment
- [ ] Backup strategy in place
- [ ] Rollback plan prepared

**🚀 Ready for Launch!**

Your Wecycle platform is now production-ready and scalable. Monitor performance, gather user feedback, and iterate based on real-world usage patterns.