import * as kv from "./kv_store.tsx";
import { validateAuth, supabase } from "./middleware.tsx";
import { validateUserRegistration } from "./validation.tsx";

// Authentication route handlers
export const signup = async (c: any) => {
  try {
    const userData = await c.req.json();
    const { email, password, name } = userData;
    
    const validationErrors = validateUserRegistration(userData);
    if (validationErrors.length > 0) {
      return c.json({ error: validationErrors.join(', ') }, 400);
    }
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name || email.split('@')[0] },
      email_confirm: true
    });
    
    if (error) {
      console.error('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }
    
    // Create initial profile and stats
    if (data.user) {
      await Promise.all([
        kv.set(`profile:${data.user.id}`, {
          id: data.user.id,
          name: name || email.split('@')[0],
          email: email,
          created_at: new Date().toISOString(),
          phone: '',
          location: '',
          bio: '',
          avatar_url: null
        }),
        kv.set(`user_stats:${data.user.id}`, {
          uploads_count: 0,
          requests_count: 0,
          total_views: 0,
          total_responses: 0,
          materials_shared: 0,
          materials_acquired: 0,
          joined_at: new Date().toISOString()
        })
      ]);
    }
    
    return c.json({ 
      message: 'User created successfully',
      user: data.user 
    });
  } catch (error) {
    console.error('Signup endpoint error:', error);
    return c.json({ error: 'Internal server error during signup' }, 500);
  }
};

export const getProfile = async (c: any) => {
  try {
    const user = c.get('user');
    const profile = await kv.get(`profile:${user.id}`);
    
    if (!profile) {
      const defaultProfile = {
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        email: user.email || '',
        created_at: new Date().toISOString(),
        phone: '',
        location: '',
        bio: '',
        avatar_url: null
      };
      
      await kv.set(`profile:${user.id}`, defaultProfile);
      return c.json(defaultProfile);
    }
    
    return c.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    return c.json({ error: 'Failed to fetch profile' }, 500);
  }
};

export const updateProfile = async (c: any) => {
  try {
    const user = c.get('user');
    const updates = await c.req.json();
    
    const existingProfile = await kv.get(`profile:${user.id}`) || {};
    const updatedProfile = {
      ...existingProfile,
      ...updates,
      id: user.id,
      updated_at: new Date().toISOString()
    };
    
    await kv.set(`profile:${user.id}`, updatedProfile);
    
    return c.json({ 
      message: 'Profile updated successfully',
      profile: updatedProfile 
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return c.json({ error: 'Failed to update profile' }, 500);
  }
};

export const getUserStats = async (c: any) => {
  try {
    const user = c.get('user');
    const userId = c.req.param('id');
    
    if (user.id !== userId) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    const stats = await kv.get(`user_stats:${userId}`) || {
      uploads_count: 0,
      requests_count: 0,
      total_views: 0,
      total_responses: 0,
      materials_shared: 0,
      materials_acquired: 0,
      joined_at: new Date().toISOString()
    };
    
    return c.json(stats);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return c.json({ error: 'Failed to fetch user stats' }, 500);
  }
};

// Register auth routes
export const registerAuthRoutes = (app: any) => {
  app.post("/make-server-6ad03eec/auth/signup", signup);
  app.get("/make-server-6ad03eec/profile", validateAuth, getProfile);
  app.put("/make-server-6ad03eec/profile", validateAuth, updateProfile);
  app.get("/make-server-6ad03eec/users/:id/stats", validateAuth, getUserStats);
};