# Wecycle Production Setup Guide

This guide will walk you through setting up Wecycle for production use with full Supabase integration.

## Prerequisites

1. A Supabase account (sign up at https://supabase.com)
2. A new Supabase project created
3. Your Supabase project URL and anon key

## Step 1: Database Schema Setup

1. **Open your Supabase dashboard** and navigate to the SQL Editor
2. **Copy and execute the main schema** from `/supabase/schema_sql.tsx`:
   - This creates all tables (profiles, uploads, requests, notifications, etc.)
   - Sets up Row Level Security (RLS) policies
   - Creates necessary triggers and functions

3. **Set up storage buckets** by executing `/supabase/storage_setup.sql`:
   - Creates buckets for uploads, avatars, and reference images
   - Configures storage policies for secure file access
   - Sets up file size limits and allowed MIME types

## Step 2: Environment Configuration

### Option A: Using Figma Secret (Recommended)
1. In your Figma project, create a secret named `WECYCLE_KEY`
2. Set the value to a JSON object:
```json
{
  "supabaseUrl": "your-project-url.supabase.co",
  "supabaseAnonKey": "your-anon-key"
}
```

### Option B: Environment Variables
Set these environment variables:
- `SUPABASE_URL` or `REACT_APP_SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `REACT_APP_SUPABASE_ANON_KEY`

## Step 3: Storage Configuration

1. **Navigate to Storage** in your Supabase dashboard
2. **Verify buckets** were created:
   - `uploads` - For material images (5MB limit)
   - `avatars` - For profile pictures (2MB limit) 
   - `reference_images` - For request reference images (3MB limit)

3. **Test file upload** by uploading a test image to any bucket

## Step 4: Authentication Setup

1. **Configure Auth providers** in Supabase Dashboard > Authentication > Providers
2. **Enable email authentication** at minimum
3. **Optional**: Enable social providers (Google, GitHub, etc.)
4. **Set up email templates** for password reset, confirmation, etc.

## Step 5: RLS Policy Verification

Verify these policies are active in Supabase Dashboard > Authentication > Policies:

### Profiles Table
- ✅ Users can view all profiles
- ✅ Users can update their own profile
- ✅ Users can insert their own profile

### Uploads Table
- ✅ Anyone can view active uploads
- ✅ Users can insert their own uploads
- ✅ Users can update their own uploads
- ✅ Users can delete their own uploads

### Storage Policies
- ✅ File path restrictions by user ID
- ✅ MIME type restrictions
- ✅ File size limits

## Step 6: Test the Application

1. **Create a test account** through the app
2. **Upload a material** with images
3. **Post a request** with reference image
4. **Test search and filtering**
5. **Verify notifications work**

## Step 7: Production Optimizations

### Performance
1. **Enable connection pooling** in Supabase settings
2. **Set up CDN** for image storage (Supabase provides this)
3. **Configure database indexes** (already included in schema)

### Security
1. **Review RLS policies** for your use case
2. **Set up database backups**
3. **Enable 2FA** on your Supabase account
4. **Monitor usage** in Supabase dashboard

### Monitoring
1. **Set up logging** in Supabase dashboard
2. **Monitor API usage** and rate limits
3. **Set up alerts** for errors or unusual activity

## Features Enabled After Setup

### Core Features
- ✅ User authentication and profiles
- ✅ Material upload with multiple images
- ✅ Request posting with reference images
- ✅ Real-time search and filtering
- ✅ Save/unsave materials
- ✅ Push notifications
- ✅ Contact visibility settings

### Advanced Features
- ✅ File storage with automatic cleanup
- ✅ User-specific file organization
- ✅ Automatic profile creation
- ✅ Request-response system
- ✅ Activity notifications
- ✅ Data persistence and sync

## Troubleshooting

### Common Issues

**"Database access denied" errors:**
- Check RLS policies are enabled
- Verify user authentication
- Ensure user has proper permissions

**File upload failures:**
- Check storage bucket policies
- Verify file size limits
- Ensure correct MIME types

**Authentication issues:**
- Verify Supabase URL and keys
- Check auth provider configuration
- Ensure email templates are set up

### Getting Help

1. **Check Supabase logs** in the dashboard
2. **Review browser console** for client-side errors
3. **Test with Supabase CLI** for advanced debugging
4. **Supabase Discord community** for support

## Production Checklist

- [ ] Database schema deployed
- [ ] Storage buckets configured
- [ ] RLS policies active
- [ ] Authentication working
- [ ] File uploads functional
- [ ] Search and filtering operational
- [ ] Notifications system active
- [ ] Error handling tested
- [ ] Performance optimized
- [ ] Security reviewed
- [ ] Backups configured
- [ ] Monitoring set up

Your Wecycle application is now production-ready! 🌱♻️