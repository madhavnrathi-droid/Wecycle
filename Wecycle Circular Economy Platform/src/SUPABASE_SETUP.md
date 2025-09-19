# Supabase Setup Guide for Wecycle

This guide will help you set up your Supabase database properly with the correct schema and Row Level Security (RLS) policies.

## Step 1: Database Schema Setup

Copy and paste the following SQL commands into your Supabase SQL Editor to create the correct database schema:

### 1. Create Tables with Correct Schema

```sql
-- Drop existing tables if they exist (CAUTION: This will delete data)
-- Only run this if you want to start fresh
-- DROP TABLE IF EXISTS notifications CASCADE;
-- DROP TABLE IF EXISTS request_responses CASCADE;
-- DROP TABLE IF EXISTS saved_items CASCADE;
-- DROP TABLE IF EXISTS requests CASCADE;
-- DROP TABLE IF EXISTS uploads CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_url TEXT,
    location TEXT DEFAULT 'Not specified',
    bio TEXT,
    phone TEXT
);

-- Create uploads table (without material_id, using category instead)
CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    dimensions TEXT,
    price NUMERIC,
    images TEXT[] DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'lapsed', 'acquired')),
    is_acquired BOOLEAN DEFAULT FALSE,
    max_duration INTEGER
);

-- Create requests table
CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    reference_image TEXT,
    notes TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed'))
);

-- Create request_responses table
CREATE TABLE IF NOT EXISTS request_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL
);

-- Create saved_items table
CREATE TABLE IF NOT EXISTS saved_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    UNIQUE(user_id, upload_id)
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('saved_item_removed', 'request_response', 'upload_acquired', 'request_fulfilled')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_id UUID
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS uploads_user_id_idx ON uploads(user_id);
CREATE INDEX IF NOT EXISTS uploads_status_idx ON uploads(status);
CREATE INDEX IF NOT EXISTS uploads_category_idx ON uploads(category);
CREATE INDEX IF NOT EXISTS uploads_created_at_idx ON uploads(created_at DESC);

CREATE INDEX IF NOT EXISTS requests_user_id_idx ON requests(user_id);
CREATE INDEX IF NOT EXISTS requests_status_idx ON requests(status);
CREATE INDEX IF NOT EXISTS requests_category_idx ON requests(category);
CREATE INDEX IF NOT EXISTS requests_created_at_idx ON requests(created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);

CREATE INDEX IF NOT EXISTS saved_items_user_id_idx ON saved_items(user_id);
```

## Step 2: Set up Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

DROP POLICY IF EXISTS "Anyone can view uploads" ON uploads;
DROP POLICY IF EXISTS "Users can insert own uploads" ON uploads;
DROP POLICY IF EXISTS "Users can update own uploads" ON uploads;
DROP POLICY IF EXISTS "Users can delete own uploads" ON uploads;

DROP POLICY IF EXISTS "Anyone can view requests" ON requests;
DROP POLICY IF EXISTS "Users can insert own requests" ON requests;
DROP POLICY IF EXISTS "Users can update own requests" ON requests;
DROP POLICY IF EXISTS "Users can delete own requests" ON requests;

DROP POLICY IF EXISTS "Users can view relevant responses" ON request_responses;
DROP POLICY IF EXISTS "Users can insert responses" ON request_responses;
DROP POLICY IF EXISTS "Users can update own responses" ON request_responses;

DROP POLICY IF EXISTS "Users can view own saved items" ON saved_items;
DROP POLICY IF EXISTS "Users can save items" ON saved_items;
DROP POLICY IF EXISTS "Users can delete own saved items" ON saved_items;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Uploads policies
CREATE POLICY "Anyone can view uploads" ON uploads
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own uploads" ON uploads
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own uploads" ON uploads
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own uploads" ON uploads
    FOR DELETE USING (auth.uid() = user_id);

-- Requests policies
CREATE POLICY "Anyone can view requests" ON requests
    FOR SELECT USING (true);

CREATE POLICY "Users can insert own requests" ON requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own requests" ON requests
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own requests" ON requests
    FOR DELETE USING (auth.uid() = user_id);

-- Request responses policies
CREATE POLICY "Users can view relevant responses" ON request_responses
    FOR SELECT USING (
        auth.uid() = user_id OR 
        auth.uid() = (SELECT user_id FROM requests WHERE id = request_id)
    );

CREATE POLICY "Users can insert responses" ON request_responses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own responses" ON request_responses
    FOR UPDATE USING (auth.uid() = user_id);

-- Saved items policies
CREATE POLICY "Users can view own saved items" ON saved_items
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can save items" ON saved_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved items" ON saved_items
    FOR DELETE USING (auth.uid() = user_id);

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert notifications" ON notifications
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

## Step 3: Set up Automatic Profile Creation

```sql
-- Function to automatically create profile after user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, location, created_at, updated_at)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email,
        COALESCE(new.raw_user_meta_data->>'location', 'Not specified'),
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        email = new.email,
        updated_at = now();
    RETURN new;
EXCEPTION
    WHEN others THEN
        -- Log the error but don't fail the user creation
        RAISE WARNING 'Could not create profile for user %: %', new.id, SQLERRM;
        RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

## Step 4: Create Storage Bucket (if not exists)

```sql
-- Create storage bucket for images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies
CREATE POLICY "Anyone can view images" ON storage.objects
    FOR SELECT USING (bucket_id = 'images');

CREATE POLICY "Authenticated users can upload images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own images" ON storage.objects
    FOR UPDATE USING (bucket_id = 'images' AND auth.uid()::text = owner);

CREATE POLICY "Users can delete own images" ON storage.objects
    FOR DELETE USING (bucket_id = 'images' AND auth.uid()::text = owner);
```

## Step 5: Update Functions for Updated At Timestamps

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to update updated_at automatically
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at 
    BEFORE UPDATE ON profiles 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_uploads_updated_at ON uploads;
CREATE TRIGGER update_uploads_updated_at 
    BEFORE UPDATE ON uploads 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_requests_updated_at ON requests;
CREATE TRIGGER update_requests_updated_at 
    BEFORE UPDATE ON requests 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
```

## Step 6: Test the Setup

After applying these changes, test by:

1. Creating a new user account
2. Check if a profile was automatically created
3. Try creating an upload
4. Try creating a request
5. Test notifications

## Step 7: Verify Everything is Working

```sql
-- Check if RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'uploads', 'requests', 'notifications', 'saved_items', 'request_responses');

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public';

-- Check if storage bucket exists
SELECT * FROM storage.buckets WHERE name = 'images';
```

## Troubleshooting

If you're still getting errors:

1. **RLS Errors**: Ensure all policies are applied and users are properly authenticated
2. **Material ID Errors**: Make sure you've run the schema update to use `category` instead of `material_id`
3. **Connection Issues**: Verify your Supabase URL and API keys are correct
4. **Storage Issues**: Ensure the images bucket is created and has proper policies

## Important Notes

- This setup removes the `material_id` column requirement and uses `category` instead
- RLS policies allow public read access to uploads and requests for discoverability
- Profile data is private to each user
- The automatic profile creation trigger handles new user registration
- All timestamps are managed automatically

## Migration from Existing Database

If you have existing data and the `material_id` column exists, you can migrate it:

```sql
-- If you have existing data with material_id, migrate to category
-- UPDATE uploads SET category = 'Materials' WHERE material_id IS NOT NULL;
-- ALTER TABLE uploads DROP COLUMN IF EXISTS material_id;
```