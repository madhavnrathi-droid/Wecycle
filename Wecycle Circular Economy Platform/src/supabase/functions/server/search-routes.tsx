import * as kv from "./kv_store.tsx";

// Search route handlers
export const searchUploads = async (c: any) => {
  try {
    const query = c.req.query('q') || '';
    const category = c.req.query('category') || 'all';
    const sortBy = c.req.query('sortBy') || 'newest';
    
    const uploads = await kv.getByPrefix('upload:');
    const now = new Date();
    
    let filteredUploads = uploads.filter(upload => {
      const isActive = upload.status === 'active' && !upload.is_acquired;
      const notExpired = !upload.expires_at || new Date(upload.expires_at) > now;
      const matchesQuery = !query || 
        upload.title.toLowerCase().includes(query.toLowerCase()) ||
        upload.description.toLowerCase().includes(query.toLowerCase()) ||
        upload.category.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = category === 'all' || upload.category === category;
      
      return isActive && notExpired && matchesQuery && matchesCategory;
    });
    
    // Apply sorting
    filteredUploads.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price_low':
          return (a.price || 0) - (b.price || 0);
        case 'price_high':
          return (b.price || 0) - (a.price || 0);
        case 'expiring_soon':
          if (!a.expires_at && !b.expires_at) return 0;
          if (!a.expires_at) return 1;
          if (!b.expires_at) return -1;
          return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    
    return c.json(filteredUploads);
  } catch (error) {
    console.error('Error searching uploads:', error);
    return c.json({ error: 'Failed to search uploads' }, 500);
  }
};

export const searchRequests = async (c: any) => {
  try {
    const query = c.req.query('q') || '';
    const category = c.req.query('category') || 'all';
    const urgency = c.req.query('urgency') || 'all';
    const sortBy = c.req.query('sortBy') || 'newest';
    
    const requests = await kv.getByPrefix('request:');
    const now = new Date();
    
    let filteredRequests = requests.filter(request => {
      const isActive = request.status === 'active';
      const notExpired = !request.expires_at || new Date(request.expires_at) > now;
      const matchesQuery = !query || 
        request.title.toLowerCase().includes(query.toLowerCase()) ||
        request.description.toLowerCase().includes(query.toLowerCase()) ||
        request.category.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = category === 'all' || request.category === category;
      const matchesUrgency = urgency === 'all' || request.urgency === urgency;
      
      return isActive && notExpired && matchesQuery && matchesCategory && matchesUrgency;
    });
    
    // Apply sorting
    filteredRequests.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'urgency':
          const urgencyOrder = { high: 3, medium: 2, low: 1 };
          return (urgencyOrder[b.urgency as keyof typeof urgencyOrder] || 0) - (urgencyOrder[a.urgency as keyof typeof urgencyOrder] || 0);
        case 'expiring_soon':
          if (!a.expires_at && !b.expires_at) return 0;
          if (!a.expires_at) return 1;
          if (!b.expires_at) return -1;
          return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
        case 'most_responses':
          return (b.response_count || 0) - (a.response_count || 0);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    
    return c.json(filteredRequests);
  } catch (error) {
    console.error('Error searching requests:', error);
    return c.json({ error: 'Failed to search requests' }, 500);
  }
};

// Register search routes
export const registerSearchRoutes = (app: any) => {
  app.get("/make-server-6ad03eec/search/uploads", searchUploads);
  app.get("/make-server-6ad03eec/search/requests", searchRequests);
};