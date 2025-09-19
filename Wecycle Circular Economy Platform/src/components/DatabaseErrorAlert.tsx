import { useState } from 'react'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { 
  AlertTriangle, 
  Database, 
  ExternalLink, 
  RefreshCw, 
  Shield,
  X,
  Copy,
  Check
} from 'lucide-react'

interface DatabaseErrorAlertProps {
  error: any
  onRetry?: () => void
  onClose?: () => void
  context?: string
}

export function DatabaseErrorAlert({ error, onRetry, onClose, context = "database operation" }: DatabaseErrorAlertProps) {
  const [showSolution, setShowSolution] = useState(false)
  const [copied, setCopied] = useState(false)

  // Determine error type and provide specific guidance
  const getErrorInfo = (error: any) => {
    const code = error?.code
    const message = error?.message || error?.toString()

    if (code === 'INVALID_WECYCLE_KEY' || message.includes('WECYCLE_KEY')) {
      return {
        type: 'wecycle_key',
        title: 'WECYCLE_KEY Configuration Error',
        description: 'The WECYCLE_KEY environment variable is not properly configured.',
        severity: 'error',
        icon: Shield,
        color: 'orange'
      }
    }

    if (code === '42501' || message.includes('row-level security policy')) {
      return {
        type: 'rls',
        title: 'Database Permissions Required',
        description: 'Row Level Security policies need to be configured in your Supabase database.',
        severity: 'error',
        icon: Shield,
        color: 'red'
      }
    }

    if (code === '23502' || message.includes('not-null constraint') || message.includes('material_id')) {
      return {
        type: 'schema',
        title: 'Database Schema Mismatch',
        description: 'Your database schema doesn\'t match the application requirements.',
        severity: 'error',
        icon: Database,
        color: 'orange'
      }
    }

    if (message.includes('Network connection error') || message.includes('Failed to fetch')) {
      return {
        type: 'network',
        title: 'Connection Error',
        description: 'Unable to connect to the database. Check your internet connection.',
        severity: 'warning',
        icon: AlertTriangle,
        color: 'yellow'
      }
    }

    return {
      type: 'unknown',
      title: 'Database Error',
      description: 'An unexpected database error occurred.',
      severity: 'error',
      icon: AlertTriangle,
      color: 'red'
    }
  }

  const errorInfo = getErrorInfo(error)
  const Icon = errorInfo.icon

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getSqlCommands = () => {
    if (errorInfo.type === 'wecycle_key') {
      return error?.correctFormat || '{"supabaseUrl":"https://wzgalvcieeiazqqdmsrd.supabase.co","supabaseServiceRoleKey":"eyJhbG...","supabaseAnonKey":"eyJhbG..."}'
    }

    if (errorInfo.type === 'rls') {
      return `-- Run these commands in your Supabase SQL Editor to fix RLS issues:

-- Enable RLS on tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Create policies for uploads
CREATE POLICY "Anyone can view uploads" ON uploads
    FOR SELECT USING (true);
CREATE POLICY "Users can insert own uploads" ON uploads
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own uploads" ON uploads
    FOR UPDATE USING (auth.uid() = user_id);

-- Create automatic profile creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $
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
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();`
    }

    if (errorInfo.type === 'schema') {
      return `-- Run these commands to fix schema issues:

-- Update uploads table schema (remove material_id requirement)
ALTER TABLE uploads DROP COLUMN IF EXISTS material_id;

-- Ensure uploads table has correct schema
ALTER TABLE uploads 
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Materials';

-- Update any existing data
UPDATE uploads SET category = 'Materials' WHERE category IS NULL;

-- Ensure other required columns exist
ALTER TABLE uploads 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS is_acquired BOOLEAN DEFAULT FALSE;`
    }

    return ''
  }

  return (
    <Alert className={`border-${errorInfo.color}-200 bg-${errorInfo.color}-50 dark:bg-${errorInfo.color}-950 dark:border-${errorInfo.color}-800`}>
      <Icon className={`h-4 w-4 text-${errorInfo.color}-600`} />
      <AlertDescription className={`text-${errorInfo.color}-800 dark:text-${errorInfo.color}-200`}>
        <div className="space-y-3">
          <div>
            <p className="font-medium">{errorInfo.title}</p>
            <p className="text-sm mt-1">{errorInfo.description}</p>
            {context && (
              <p className="text-xs mt-1 opacity-75">Context: {context}</p>
            )}
          </div>

          {/* Error details (collapsible) */}
          <details className="text-xs">
            <summary className="cursor-pointer hover:underline">Technical Details</summary>
            <pre className="mt-2 p-2 bg-black/10 dark:bg-white/10 rounded text-xs overflow-x-auto">
              {JSON.stringify(error, null, 2)}
            </pre>
          </details>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {onRetry && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={onRetry}
                className={`border-${errorInfo.color}-300 text-${errorInfo.color}-700 hover:bg-${errorInfo.color}-100 dark:border-${errorInfo.color}-700 dark:text-${errorInfo.color}-300 dark:hover:bg-${errorInfo.color}-900`}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button>
            )}

            {(errorInfo.type === 'rls' || errorInfo.type === 'schema' || errorInfo.type === 'wecycle_key') && (
              <>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setShowSolution(!showSolution)}
                  className={`border-${errorInfo.color}-300 text-${errorInfo.color}-700 hover:bg-${errorInfo.color}-100 dark:border-${errorInfo.color}-700 dark:text-${errorInfo.color}-300 dark:hover:bg-${errorInfo.color}-900`}
                >
                  <Database className="w-4 h-4 mr-1" />
                  {showSolution ? 'Hide Solution' : 'Show Solution'}
                </Button>

                {errorInfo.type !== 'wecycle_key' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                    className={`border-${errorInfo.color}-300 text-${errorInfo.color}-700 hover:bg-${errorInfo.color}-100 dark:border-${errorInfo.color}-700 dark:text-${errorInfo.color}-300 dark:hover:bg-${errorInfo.color}-900`}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Open Supabase
                  </Button>
                )}

                {errorInfo.type === 'wecycle_key' && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => window.open('https://supabase.com/dashboard/project/wzgalvcieeiazqqdmsrd/settings/api', '_blank')}
                    className={`border-${errorInfo.color}-300 text-${errorInfo.color}-700 hover:bg-${errorInfo.color}-100 dark:border-${errorInfo.color}-700 dark:text-${errorInfo.color}-300 dark:hover:bg-${errorInfo.color}-900`}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Get Anon Key
                  </Button>
                )}
              </>
            )}

            {onClose && (
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={onClose}
                className={`text-${errorInfo.color}-700 hover:bg-${errorInfo.color}-100 dark:text-${errorInfo.color}-300 dark:hover:bg-${errorInfo.color}-900`}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Solution panel */}
          {showSolution && (errorInfo.type === 'rls' || errorInfo.type === 'schema' || errorInfo.type === 'wecycle_key') && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  {errorInfo.type === 'wecycle_key' ? 'WECYCLE_KEY Configuration' : 'SQL Commands to Fix This Issue'}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(getSqlCommands())}
                    className="h-8 w-8 p-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {errorInfo.type === 'wecycle_key' ? (
                    <div className="text-sm space-y-2">
                      <p><strong>Steps to fix WECYCLE_KEY:</strong></p>
                      {error?.instructions ? (
                        <ol className="list-decimal list-inside space-y-1 ml-4 text-sm">
                          <li>{error.instructions.step1}</li>
                          <li>{error.instructions.step2}</li>
                          <li>{error.instructions.step3}</li>
                          <li>{error.instructions.step4}</li>
                        </ol>
                      ) : (
                        <ol className="list-decimal list-inside space-y-1 ml-4 text-sm">
                          <li>Go to <a href="https://supabase.com/dashboard/project/wzgalvcieeiazqqdmsrd/settings/api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">your Supabase API settings</a></li>
                          <li>Copy your "anon public" key (starts with "eyJ...")</li>
                          <li>Replace "YOUR_ANON_KEY_HERE" in the JSON below</li>
                          <li>Set the complete JSON as your WECYCLE_KEY environment variable</li>
                        </ol>
                      )}

                      {error?.details && (
                        <div className="mt-3">
                          <p><strong>Issues found:</strong></p>
                          <ul className="list-disc list-inside space-y-1 ml-4 text-sm text-red-600 dark:text-red-400">
                            {error.details.map((issue: string, index: number) => (
                              <li key={index}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <p><strong>Correct WECYCLE_KEY format:</strong></p>
                      <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto border">
                        {getSqlCommands()}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-sm space-y-2">
                      <p><strong>Steps to fix:</strong></p>
                      <ol className="list-decimal list-inside space-y-1 ml-4 text-sm">
                        <li>Open your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Supabase Dashboard</a></li>
                        <li>Go to the SQL Editor</li>
                        <li>Copy and paste the SQL commands below</li>
                        <li>Run the commands</li>
                        <li>Try the operation again</li>
                      </ol>

                      <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto border">
                        {getSqlCommands()}
                      </pre>
                    </div>
                  )}

                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <p><strong>Need help?</strong> Check the full setup guide in <code>SUPABASE_SETUP.md</code></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}