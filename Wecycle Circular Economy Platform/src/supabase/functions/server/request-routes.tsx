import * as kv from "./kv_store.tsx";
import { validateAuth } from "./middleware.tsx";
import { validateRequestData } from "./validation.tsx";

// Request route handlers
export const createRequest = async (c: any) => {
  try {
    const user = c.get('user');
    const requestData = await c.req.json();
    
    const validationErrors = validateRequestData(requestData);
    if (validationErrors.length > 0) {
      return c.json({ error: `Validation failed: ${validationErrors.join(', ')}` }, 400);
    }
    
    const request = {
      id: crypto.randomUUID(),
      user_id: user.id,
      ...requestData,
      created_at: new Date().toISOString(),
      status: 'active',
      response_count: 0,
      view_count: 0,
      urgency: requestData.urgency || 'medium'
    };
    
    await kv.set(`request:${request.id}`, request);
    
    // Add to user's requests list
    const userRequests = await kv.get(`user_requests:${user.id}`) || [];
    userRequests.unshift(request.id);
    await kv.set(`user_requests:${user.id}`, userRequests.slice(0, 100));
    
    // Update user stats
    const userStats = await kv.get(`user_stats:${user.id}`) || { requests_count: 0 };
    userStats.requests_count = (userStats.requests_count || 0) + 1;
    await kv.set(`user_stats:${user.id}`, userStats);
    
    // Create notification
    const notification = {
      id: crypto.randomUUID(),
      user_id: user.id,
      type: 'request_created',
      title: 'Request posted successfully',
      message: `Your request for "${request.title}" is now live`,
      related_id: request.id,
      is_read: false,
      created_at: new Date().toISOString()
    };
    await kv.set(`notification:${user.id}:${notification.id}`, notification);
    
    return c.json({ message: 'Request created successfully', request });
  } catch (error) {
    console.error('Error creating request:', error);
    return c.json({ error: 'Failed to create request' }, 500);
  }
};

export const getRequests = async (c: any) => {
  try {
    const requests = await kv.getByPrefix('request:');
    const now = new Date();
    
    const activeRequests = requests
      .filter(request => 
        request.status === 'active' && 
        (!request.expires_at || new Date(request.expires_at) > now)
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    const enhancedRequests = await Promise.all(
      activeRequests.map(async (request) => {
        const responses = await kv.getByPrefix(`request_response:${request.id}:`);
        return {
          ...request,
          is_expired: request.expires_at ? new Date(request.expires_at) <= now : false,
          days_remaining: request.expires_at ? Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null,
          response_count: responses.length,
          request_responses: responses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        };
      })
    );
    
    return c.json(enhancedRequests);
  } catch (error) {
    console.error('Error fetching requests:', error);
    return c.json({ error: 'Failed to fetch requests' }, 500);
  }
};

export const getUserRequests = async (c: any) => {
  try {
    const user = c.get('user');
    const userRequestIds = await kv.get(`user_requests:${user.id}`) || [];
    
    const requests = [];
    for (const requestId of userRequestIds) {
      const request = await kv.get(`request:${requestId}`);
      if (request) {
        const responses = await kv.getByPrefix(`request_response:${requestId}:`);
        const now = new Date();
        
        requests.push({
          ...request,
          is_expired: request.expires_at ? new Date(request.expires_at) <= now : false,
          days_remaining: request.expires_at ? Math.max(0, Math.ceil((new Date(request.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null,
          response_count: responses.length,
          request_responses: responses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
          latest_response: responses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null
        });
      }
    }
    
    return c.json(requests);
  } catch (error) {
    console.error('Error fetching user requests:', error);
    return c.json({ error: 'Failed to fetch user requests' }, 500);
  }
};

export const updateRequest = async (c: any) => {
  try {
    const user = c.get('user');
    const requestId = c.req.param('id');
    const updates = await c.req.json();
    
    const existingRequest = await kv.get(`request:${requestId}`);
    if (!existingRequest) {
      return c.json({ error: 'Request not found' }, 404);
    }
    
    if (existingRequest.user_id !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    const updatedRequest = {
      ...existingRequest,
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    await kv.set(`request:${requestId}`, updatedRequest);
    
    return c.json({ message: 'Request updated successfully', request: updatedRequest });
  } catch (error) {
    console.error('Error updating request:', error);
    return c.json({ error: 'Failed to update request' }, 500);
  }
};

export const deleteRequest = async (c: any) => {
  try {
    const user = c.get('user');
    const requestId = c.req.param('id');
    
    const existingRequest = await kv.get(`request:${requestId}`);
    if (!existingRequest) {
      return c.json({ error: 'Request not found' }, 404);
    }
    
    if (existingRequest.user_id !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    // Remove request and all associated responses
    await kv.del(`request:${requestId}`);
    const responses = await kv.getByPrefix(`request_response:${requestId}:`);
    for (const response of responses) {
      await kv.del(`request_response:${requestId}:${response.id}`);
    }
    
    // Remove from user's requests list
    const userRequests = await kv.get(`user_requests:${user.id}`) || [];
    const updatedRequests = userRequests.filter((id: string) => id !== requestId);
    await kv.set(`user_requests:${user.id}`, updatedRequests);
    
    // Create deletion notification
    const notification = {
      id: crypto.randomUUID(),
      user_id: user.id,
      type: 'request_deleted',
      title: 'Request removed',
      message: `Your request for "${existingRequest.title}" has been removed`,
      related_id: requestId,
      is_read: false,
      created_at: new Date().toISOString()
    };
    await kv.set(`notification:${user.id}:${notification.id}`, notification);
    
    return c.json({ message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Error deleting request:', error);
    return c.json({ error: 'Failed to delete request' }, 500);
  }
};

export const addResponse = async (c: any) => {
  try {
    const user = c.get('user');
    const requestId = c.req.param('id');
    const { message, attachments } = await c.req.json();
    
    if (!message?.trim()) {
      return c.json({ error: 'Response message is required' }, 400);
    }
    
    const request = await kv.get(`request:${requestId}`);
    if (!request) {
      return c.json({ error: 'Request not found' }, 404);
    }
    
    if (request.user_id === user.id) {
      return c.json({ error: 'Cannot respond to your own request' }, 400);
    }
    
    if (request.status !== 'active') {
      return c.json({ error: 'Cannot respond to inactive request' }, 400);
    }
    
    const response = {
      id: crypto.randomUUID(),
      request_id: requestId,
      user_id: user.id,
      message: message.trim(),
      attachments: attachments || [],
      created_at: new Date().toISOString()
    };
    
    await kv.set(`request_response:${requestId}:${response.id}`, response);
    
    // Update request response count
    request.response_count = (request.response_count || 0) + 1;
    await kv.set(`request:${requestId}`, request);
    
    // Create notification for request owner
    const notification = {
      id: crypto.randomUUID(),
      user_id: request.user_id,
      type: 'request_response',
      title: 'New response to your request',
      message: `Someone responded to your "${request.title}" request`,
      related_id: requestId,
      is_read: false,
      created_at: new Date().toISOString()
    };
    await kv.set(`notification:${request.user_id}:${notification.id}`, notification);
    
    return c.json({ message: 'Response added successfully', response });
  } catch (error) {
    console.error('Error adding response:', error);
    return c.json({ error: 'Failed to add response' }, 500);
  }
};

// Register request routes
export const registerRequestRoutes = (app: any) => {
  app.post("/make-server-6ad03eec/requests", validateAuth, createRequest);
  app.get("/make-server-6ad03eec/requests", getRequests);
  app.get("/make-server-6ad03eec/requests/user", validateAuth, getUserRequests);
  app.put("/make-server-6ad03eec/requests/:id", validateAuth, updateRequest);
  app.delete("/make-server-6ad03eec/requests/:id", validateAuth, deleteRequest);
  app.post("/make-server-6ad03eec/requests/:id/responses", validateAuth, addResponse);
};