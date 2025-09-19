-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Enable RLS on uploads table
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

-- Allow users to see all uploads (public read)
CREATE POLICY "Anyone can view uploads" ON uploads
  FOR SELECT USING (true);

-- Allow users to insert their own uploads
CREATE POLICY "Users can insert own uploads" ON uploads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own uploads
CREATE POLICY "Users can update own uploads" ON uploads
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own uploads" ON uploads
  FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on requests table
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Allow users to see all requests (public read)
CREATE POLICY "Anyone can view requests" ON requests
  FOR SELECT USING (true);

-- Allow users to insert their own requests
CREATE POLICY "Users can insert own requests" ON requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own requests
CREATE POLICY "Users can update own requests" ON requests
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to delete their own requests
CREATE POLICY "Users can delete own requests" ON requests
  FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on request_responses table
ALTER TABLE request_responses ENABLE ROW LEVEL SECURITY;

-- Allow users to see responses to their requests and responses they made
CREATE POLICY "Users can view relevant responses" ON request_responses
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() = (SELECT user_id FROM requests WHERE id = request_id)
  );

-- Allow users to insert responses
CREATE POLICY "Users can insert responses" ON request_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own responses
CREATE POLICY "Users can update own responses" ON request_responses
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable RLS on saved_items table
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own saved items
CREATE POLICY "Users can view own saved items" ON saved_items
  FOR SELECT USING (auth.uid() = user_id);

-- Allow users to save items
CREATE POLICY "Users can save items" ON saved_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to unsave their items
CREATE POLICY "Users can delete own saved items" ON saved_items
  FOR DELETE USING (auth.uid() = user_id);

-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Allow system to insert notifications (this might need to be adjusted based on your notification system)
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Allow users to update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

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
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();