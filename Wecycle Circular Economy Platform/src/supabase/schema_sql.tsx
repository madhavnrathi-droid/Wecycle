-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE upload_status AS ENUM ('active', 'lapsed', 'acquired');
CREATE TYPE request_status AS ENUM ('active', 'inactive', 'completed');
CREATE TYPE notification_type AS ENUM ('saved_item_removed', 'request_response', 'upload_acquired', 'request_fulfilled');

-- Create profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  location TEXT NOT NULL,
  bio TEXT,
  phone TEXT,
  website TEXT
);

-- Create uploads table
CREATE TABLE IF NOT EXISTS uploads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  dimensions TEXT,
  price DECIMAL(10,2),
  images TEXT[] DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  status upload_status DEFAULT 'active',
  is_acquired BOOLEAN DEFAULT FALSE,
  max_duration INTEGER
);

-- Create requests table
CREATE TABLE IF NOT EXISTS requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  reference_image TEXT,
  notes TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  status request_status DEFAULT 'active'
);

-- Create request_responses table
CREATE TABLE IF NOT EXISTS request_responses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL
);

-- Create saved_items table
CREATE TABLE IF NOT EXISTS saved_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  upload_id UUID REFERENCES uploads(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(user_id, upload_id)
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  related_id UUID
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_uploads_updated_at BEFORE UPDATE ON uploads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_requests_updated_at BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Uploads policies
CREATE POLICY "Anyone can view active uploads" ON uploads FOR SELECT USING (status = 'active' OR user_id = auth.uid());
CREATE POLICY "Users can insert their own uploads" ON uploads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own uploads" ON uploads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own uploads" ON uploads FOR DELETE USING (auth.uid() = user_id);

-- Requests policies
CREATE POLICY "Anyone can view active requests" ON requests FOR SELECT USING (status = 'active' OR user_id = auth.uid());
CREATE POLICY "Users can insert their own requests" ON requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own requests" ON requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own requests" ON requests FOR DELETE USING (auth.uid() = user_id);

-- Request responses policies
CREATE POLICY "Users can view responses to their requests" ON request_responses FOR SELECT USING (
  EXISTS (SELECT 1 FROM requests WHERE requests.id = request_responses.request_id AND requests.user_id = auth.uid())
  OR auth.uid() = user_id
);
CREATE POLICY "Users can insert responses to requests" ON request_responses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own responses" ON request_responses FOR UPDATE USING (auth.uid() = user_id);

-- Saved items policies
CREATE POLICY "Users can view their own saved items" ON saved_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own saved items" ON saved_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own saved items" ON saved_items FOR DELETE USING (auth.uid() = user_id);

-- Notifications policies
CREATE POLICY "Users can view their own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX uploads_user_id_idx ON uploads(user_id);
CREATE INDEX uploads_status_idx ON uploads(status);
CREATE INDEX uploads_category_idx ON uploads(category);
CREATE INDEX uploads_created_at_idx ON uploads(created_at);

CREATE INDEX requests_user_id_idx ON requests(user_id);
CREATE INDEX requests_status_idx ON requests(status);
CREATE INDEX requests_category_idx ON requests(category);
CREATE INDEX requests_created_at_idx ON requests(created_at);

CREATE INDEX saved_items_user_id_idx ON saved_items(user_id);
CREATE INDEX saved_items_upload_id_idx ON saved_items(upload_id);

CREATE INDEX notifications_user_id_idx ON notifications(user_id);
CREATE INDEX notifications_is_read_idx ON notifications(is_read);
CREATE INDEX notifications_created_at_idx ON notifications(created_at);

-- Function to create profile on signup (improved with error handling)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
  user_location TEXT;
BEGIN
  -- Extract name from metadata or use email prefix as fallback
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name', 
    split_part(NEW.email, '@', 1),
    'New User'
  );
  
  -- Extract location from metadata or use default
  user_location := COALESCE(NEW.raw_user_meta_data->>'location', 'Not specified');
  
  -- Insert profile with error handling
  INSERT INTO public.profiles (id, name, email, location)
  VALUES (NEW.id, user_name, COALESCE(NEW.email, ''), user_location)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    location = EXCLUDED.location,
    updated_at = NOW();
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to send notifications
CREATE OR REPLACE FUNCTION notify_saved_item_removed()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify users who saved this upload that it's being removed
  INSERT INTO notifications (user_id, type, title, message, related_id)
  SELECT 
    saved_items.user_id,
    'saved_item_removed',
    'Saved item no longer available',
    'The ' || OLD.title || ' you saved has been removed',
    OLD.id
  FROM saved_items
  WHERE saved_items.upload_id = OLD.id;
  
  -- Remove all saved_items entries for this upload
  DELETE FROM saved_items WHERE upload_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for upload deletion notifications
CREATE TRIGGER upload_deleted_notification
  BEFORE DELETE ON uploads
  FOR EACH ROW EXECUTE FUNCTION notify_saved_item_removed();

-- Function to notify on upload acquisition
CREATE OR REPLACE FUNCTION notify_upload_acquired()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_acquired = TRUE AND OLD.is_acquired = FALSE THEN
    INSERT INTO notifications (user_id, type, title, message, related_id)
    VALUES (
      NEW.user_id,
      'upload_acquired',
      'Your item was acquired',
      'Someone picked up your ' || NEW.title,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for upload acquisition notifications
CREATE TRIGGER upload_acquired_notification
  AFTER UPDATE ON uploads
  FOR EACH ROW EXECUTE FUNCTION notify_upload_acquired();

-- Manual profile creation function for admin use
CREATE OR REPLACE FUNCTION create_missing_profiles()
RETURNS INTEGER AS $$
DECLARE
  user_record RECORD;
  created_count INTEGER := 0;
BEGIN
  -- Find users without profiles
  FOR user_record IN 
    SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN profiles p ON u.id = p.id
    WHERE p.id IS NULL
  LOOP
    BEGIN
      INSERT INTO profiles (id, name, email, location)
      VALUES (
        user_record.id,
        COALESCE(
          user_record.raw_user_meta_data->>'name', 
          split_part(user_record.email, '@', 1),
          'New User'
        ),
        COALESCE(user_record.email, ''),
        COALESCE(user_record.raw_user_meta_data->>'location', 'Not specified')
      );
      created_count := created_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to create profile for user %: %', user_record.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN created_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;