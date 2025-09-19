import * as kv from "./kv_store.tsx";
import { validateAuth } from "./middleware.tsx";

// Notification route handlers
export const getNotifications = async (c: any) => {
  try {
    const user = c.get('user');
    const notifications = await kv.getByPrefix(`notification:${user.id}:`);
    
    const sortedNotifications = notifications.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return c.json(sortedNotifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return c.json({ error: 'Failed to fetch notifications' }, 500);
  }
};

export const createNotification = async (c: any) => {
  try {
    const { user_id, title, message, type = 'info' } = await c.req.json();
    
    const notification = {
      id: crypto.randomUUID(),
      user_id,
      title,
      message,
      type,
      is_read: false,
      created_at: new Date().toISOString()
    };
    
    await kv.set(`notification:${user_id}:${notification.id}`, notification);
    
    return c.json({ 
      message: 'Notification created successfully',
      notification 
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    return c.json({ error: 'Failed to create notification' }, 500);
  }
};

export const markNotificationRead = async (c: any) => {
  try {
    const user = c.get('user');
    const notificationId = c.req.param('id');
    
    const notification = await kv.get(`notification:${user.id}:${notificationId}`);
    if (!notification) {
      return c.json({ error: 'Notification not found' }, 404);
    }
    
    notification.is_read = true;
    notification.read_at = new Date().toISOString();
    
    await kv.set(`notification:${user.id}:${notificationId}`, notification);
    
    return c.json({ 
      message: 'Notification marked as read',
      notification 
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    return c.json({ error: 'Failed to update notification' }, 500);
  }
};

// Register notification routes
export const registerNotificationRoutes = (app: any) => {
  app.get("/make-server-6ad03eec/notifications", validateAuth, getNotifications);
  app.post("/make-server-6ad03eec/notifications", validateAuth, createNotification);
  app.put("/make-server-6ad03eec/notifications/:id/read", validateAuth, markNotificationRead);
};