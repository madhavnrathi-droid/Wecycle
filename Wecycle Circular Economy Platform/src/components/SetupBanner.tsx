import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { AlertCircle, ExternalLink, Copy, Check, Database, Key, Settings } from 'lucide-react'

export function SetupBanner() {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const sqlSchema = `-- Create profiles table
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  email text not null,
  avatar_url text,
  location text not null,
  bio text,
  phone text,
  website text
);

-- Create uploads table
create table uploads (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text not null,
  category text not null,
  location text not null,
  dimensions text,
  price decimal,
  images text[] default '{}',
  expires_at timestamp with time zone,
  status text default 'active' check (status in ('active', 'lapsed', 'acquired')),
  is_acquired boolean default false,
  max_duration integer
);

-- Create requests table
create table requests (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text not null,
  category text not null,
  location text not null,
  reference_image text,
  notes text,
  expires_at timestamp with time zone not null,
  status text default 'active' check (status in ('active', 'inactive', 'completed'))
);

-- Create request_responses table
create table request_responses (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  request_id uuid references requests on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  message text not null
);

-- Create saved_items table
create table saved_items (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users on delete cascade not null,
  upload_id uuid references uploads on delete cascade not null,
  unique(user_id, upload_id)
);

-- Create notifications table
create table notifications (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users on delete cascade not null,
  type text not null check (type in ('saved_item_removed', 'request_response', 'upload_acquired', 'request_fulfilled')),
  title text not null,
  message text not null,
  is_read boolean default false,
  related_id uuid
);

-- Enable Row Level Security
alter table profiles enable row level security;
alter table uploads enable row level security;
alter table requests enable row level security;
alter table request_responses enable row level security;
alter table saved_items enable row level security;
alter table notifications enable row level security;

-- Create policies
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "Anyone can view active uploads" on uploads for select using (status = 'active');
create policy "Users can manage own uploads" on uploads for all using (auth.uid() = user_id);

create policy "Anyone can view active requests" on requests for select using (status = 'active');
create policy "Users can manage own requests" on requests for all using (auth.uid() = user_id);

create policy "Users can view responses to own requests" on request_responses for select using (
  auth.uid() in (
    select user_id from requests where id = request_responses.request_id
  )
);
create policy "Users can create responses" on request_responses for insert with check (auth.uid() = user_id);

create policy "Users can manage own saved items" on saved_items for all using (auth.uid() = user_id);

create policy "Users can view own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Users can update own notifications" on notifications for update using (auth.uid() = user_id);`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Supabase Setup Required
                <Badge variant="outline" className="text-blue-600 border-blue-600">Setup Required</Badge>
              </CardTitle>
              <p className="text-gray-600 mt-1">
                Connect your Supabase project to enable all features
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Warning */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-amber-800 mb-1">
                <strong>Demo Mode Active:</strong> You're currently viewing Wecycle with mock data.
              </p>
              <p className="text-amber-700">
                To access full functionality including user authentication, real-time updates, and data persistence, 
                you need to connect your own Supabase project.
              </p>
            </div>
          </div>

          {/* Setup Steps */}
          <div className="space-y-6">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Setup Instructions
            </h3>

            {/* Step 1 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">1</div>
                <h4 className="font-medium">Create a Supabase Project</h4>
              </div>
              <div className="ml-8 space-y-2">
                <p className="text-gray-600">
                  Go to Supabase and create a new project for your Wecycle instance.
                </p>
                <Button variant="outline" className="text-blue-600 border-blue-600" asChild>
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Supabase Dashboard
                  </a>
                </Button>
              </div>
            </div>

            <Separator />

            {/* Step 2 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">2</div>
                <h4 className="font-medium">Set Up Database Schema</h4>
              </div>
              <div className="ml-8 space-y-3">
                <p className="text-gray-600">
                  Copy and run this SQL in your Supabase SQL Editor to create all required tables:
                </p>
                <div className="relative">
                  <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto max-h-48 border">
                    {sqlSchema}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(sqlSchema, 'sql')}
                  >
                    {copied === 'sql' ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            {/* Step 3 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">3</div>
                <h4 className="font-medium">Configure Storage</h4>
              </div>
              <div className="ml-8 space-y-2">
                <p className="text-gray-600">
                  Create a storage bucket named "images" in your Supabase project:
                </p>
                <ul className="text-gray-600 text-sm space-y-1 list-disc list-inside ml-4">
                  <li>Go to Storage in your Supabase dashboard</li>
                  <li>Create a new bucket called "images"</li>
                  <li>Make it public (for image access)</li>
                  <li>Allow JPEG, PNG, WebP file types</li>
                </ul>
              </div>
            </div>

            <Separator />

            {/* Step 4 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">4</div>
                <h4 className="font-medium">Update Configuration</h4>
              </div>
              <div className="ml-8 space-y-3">
                <p className="text-gray-600">
                  Get your project credentials from Settings → API and update the configuration in <code className="bg-gray-100 px-1 rounded">lib/supabase.ts</code>:
                </p>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Project URL:</label>
                    <div className="relative">
                      <code className="block bg-gray-100 p-3 rounded border text-sm">
                        const supabaseUrl = 'https://your-project.supabase.co'
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard("const supabaseUrl = 'https://your-project.supabase.co'", 'url')}
                      >
                        {copied === 'url' ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Anon Key:</label>
                    <div className="relative">
                      <code className="block bg-gray-100 p-3 rounded border text-sm">
                        const supabaseAnonKey = 'your-anon-key-here'
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard("const supabaseAnonKey = 'your-anon-key-here'", 'key')}
                      >
                        {copied === 'key' ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Step 5 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm">✓</div>
                <h4 className="font-medium text-green-700">Ready to Go!</h4>
              </div>
              <div className="ml-8">
                <p className="text-gray-600">
                  Once configured, refresh the page to start using Wecycle with your own Supabase backend.
                  All features including authentication, real-time updates, and data persistence will be available.
                </p>
              </div>
            </div>
          </div>

          {/* Documentation Links */}
          <div className="border-t pt-6">
            <h4 className="font-medium mb-3">Need Help?</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button variant="outline" className="justify-start" asChild>
                <a href="https://supabase.com/docs/guides/getting-started" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Supabase Documentation
                </a>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <a href="https://supabase.com/docs/guides/database/overview" target="_blank" rel="noopener noreferrer">
                  <Database className="w-4 h-4 mr-2" />
                  Database Setup Guide
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}