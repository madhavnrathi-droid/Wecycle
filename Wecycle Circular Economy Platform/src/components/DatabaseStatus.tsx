import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { Database, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'

interface TableStatus {
  name: string
  exists: boolean
  error?: string
  rowCount?: number
}

export function DatabaseStatus() {
  const [loading, setLoading] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [tables, setTables] = useState<TableStatus[]>([])
  const [errorMessage, setErrorMessage] = useState<string>('')

  const expectedTables = [
    'profiles',
    'uploads', 
    'requests',
    'request_responses',
    'saved_items',
    'notifications'
  ]

  useEffect(() => {
    checkDatabaseStatus()
  }, [])

  const checkDatabaseStatus = async () => {
    if (!isSupabaseConfigured) {
      setConnectionStatus('error')
      setErrorMessage('Supabase is not configured')
      return
    }

    setLoading(true)
    setConnectionStatus('checking')
    
    try {
      // Test basic connection
      const { data: authData, error: authError } = await supabase.auth.getUser()
      
      if (authError && authError.message !== 'User not found') {
        throw new Error(`Auth error: ${authError.message}`)
      }

      setConnectionStatus('connected')

      // Check each table
      const tableStatuses: TableStatus[] = []
      
      for (const tableName of expectedTables) {
        try {
          const { data, error, count } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })
            .limit(1)

          if (error) {
            tableStatuses.push({
              name: tableName,
              exists: false,
              error: error.message
            })
          } else {
            tableStatuses.push({
              name: tableName,
              exists: true,
              rowCount: count || 0
            })
          }
        } catch (err: any) {
          tableStatuses.push({
            name: tableName,
            exists: false,
            error: err.message
          })
        }
      }

      setTables(tableStatuses)
      
    } catch (error: any) {
      setConnectionStatus('error')
      setErrorMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: 'checking' | 'connected' | 'error') => {
    switch (status) {
      case 'checking':
        return <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />
    }
  }

  const getTableIcon = (table: TableStatus) => {
    if (table.exists) {
      return <CheckCircle className="w-4 h-4 text-green-500" />
    } else {
      return <XCircle className="w-4 h-4 text-red-500" />
    }
  }

  const missingTables = tables.filter(table => !table.exists)
  const existingTables = tables.filter(table => table.exists)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-6 h-6 text-blue-600" />
          <h1 className="text-blue-700">Database Status</h1>
        </div>
        <p className="text-gray-600 mb-4">
          Check your Supabase database connection and table setup
        </p>
        <Button onClick={checkDatabaseStatus} disabled={loading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      {/* Connection Status */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon(connectionStatus)}
            Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {connectionStatus === 'checking' && (
            <p className="text-gray-600">Checking connection...</p>
          )}
          {connectionStatus === 'connected' && (
            <div>
              <Badge className="bg-green-100 text-green-700 mb-2">Connected</Badge>
              <p className="text-gray-600 text-sm">
                Successfully connected to Supabase database
              </p>
            </div>
          )}
          {connectionStatus === 'error' && (
            <div>
              <Badge className="bg-red-100 text-red-700 mb-2">Connection Failed</Badge>
              <p className="text-red-600 text-sm">{errorMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tables Status */}
      {tables.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Database Tables
              <Badge variant="outline">
                {existingTables.length}/{expectedTables.length} Tables
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tables.map((table) => (
                <div key={table.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getTableIcon(table)}
                    <div>
                      <span className="font-medium">{table.name}</span>
                      {table.exists && table.rowCount !== undefined && (
                        <span className="text-sm text-gray-500 ml-2">
                          ({table.rowCount} rows)
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    {table.exists ? (
                      <Badge className="bg-green-100 text-green-700">Exists</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700">Missing</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Missing Tables Warning */}
      {missingTables.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="w-5 h-5" />
              Missing Tables Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-orange-700 mb-3">
              Some required database tables are missing. This will cause the app to malfunction.
            </p>
            <div className="space-y-2 mb-4">
              {missingTables.map((table) => (
                <div key={table.name} className="text-sm">
                  <span className="font-medium text-orange-800">{table.name}:</span>
                  <span className="text-orange-600 ml-2">{table.error}</span>
                </div>
              ))}
            </div>
            <div className="bg-orange-100 p-3 rounded-lg">
              <p className="text-orange-800 text-sm">
                <strong>To fix this:</strong> Run the SQL schema in your Supabase SQL editor.
                You can find the complete schema in the <code>/supabase/schema_sql.tsx</code> file.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success State */}
      {existingTables.length === expectedTables.length && connectionStatus === 'connected' && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5" />
              Database Setup Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-green-700">
              ✅ All required tables exist and are accessible. Your Wecycle app is ready to use!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}