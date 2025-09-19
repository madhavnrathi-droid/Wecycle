# Wecycle - Supabase Setup Guide

This application is currently running with mock data. To enable full functionality with real user authentication, database storage, and real-time features, you'll need to connect your Supabase project.

## What You'll Get with Supabase

- **User Authentication** - Secure signup/login system
- **Real Database** - Store uploads, requests, and user data
- **Real-time Updates** - Live notifications and data synchronization  
- **Image Storage** - Upload and store material photos
- **Security** - Row Level Security protecting user data

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Create a new organization (if needed)
4. Create a new project
5. Wait for your project to be set up

### 2. Get Your Credentials

1. In your Supabase dashboard, go to **Settings > API**
2. Copy your **Project URL**
3. Copy your **anon/public key**

### 3. Configure the Application

1. Open `/lib/supabase.ts`
2. Replace the placeholder values:
   ```typescript
   const supabaseUrl = 'YOUR_ACTUAL_SUPABASE_URL'
   const supabaseAnonKey = 'YOUR_ACTUAL_SUPABASE_ANON_KEY'
   ```

### 4. Set Up the Database

1. In your Supabase dashboard, go to **SQL Editor**
2. Copy the contents of `/supabase/schema.sql`
3. Paste and run the SQL to create all tables and policies

### 5. Set Up Storage

1. In your Supabase dashboard, go to **Storage**
2. Create a new bucket called `images`
3. Make it public by going to bucket settings
4. Allow file uploads (JPEG, PNG, WebP)

### 6. Enable Authentication

1. Go to **Authentication > Settings**
2. Enable email authentication
3. Optionally configure social logins (Google, GitHub, etc.)

### 7. Update the Application

Once you've configured Supabase:

1. Update `/App.tsx` to use the `AuthProvider` again
2. Update components to use real Supabase services instead of mock data
3. The configuration banner will automatically disappear

## Features Available After Setup

- ✅ **User Registration & Login**
- ✅ **Real Upload & Request Management** 
- ✅ **Real-time Notifications**
- ✅ **Image Upload for Materials**
- ✅ **Saved Items Functionality**
- ✅ **User Profiles & Settings**
- ✅ **Database-backed Inventory**
- ✅ **Secure Data Access**

## Need Help?

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Guide](https://supabase.com/docs/reference/javascript/start)
- [React Authentication with Supabase](https://supabase.com/docs/guides/getting-started/tutorials/with-react)

Once set up, Wecycle becomes a fully functional circular economy platform!