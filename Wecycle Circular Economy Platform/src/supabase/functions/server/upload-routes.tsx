import * as kv from "./kv_store.tsx";
import { validateAuth, supabase } from "./middleware.tsx";
import { validateUploadData, validateFileUpload } from "./validation.tsx";

// Upload route handlers
export const createUpload = async (c: any) => {
  try {
    const user = c.get('user');
    const uploadData = await c.req.json();
    
    const validationErrors = validateUploadData(uploadData);
    if (validationErrors.length > 0) {
      return c.json({ error: `Validation failed: ${validationErrors.join(', ')}` }, 400);
    }
    
    const upload = {
      id: crypto.randomUUID(),
      user_id: user.id,
      ...uploadData,
      created_at: new Date().toISOString(),
      status: 'active',
      is_acquired: false,
      view_count: 0,
      inquiry_count: 0,
      contact_settings: uploadData.contact_settings || { showPhone: false, showEmail: true }
    };
    
    await kv.set(`upload:${upload.id}`, upload);
    
    // Add to user's uploads list
    const userUploads = await kv.get(`user_uploads:${user.id}`) || [];
    userUploads.unshift(upload.id);
    await kv.set(`user_uploads:${user.id}`, userUploads.slice(0, 100));
    
    // Update user stats
    const userStats = await kv.get(`user_stats:${user.id}`) || { uploads_count: 0 };
    userStats.uploads_count = (userStats.uploads_count || 0) + 1;
    userStats.materials_shared = (userStats.materials_shared || 0) + 1;
    await kv.set(`user_stats:${user.id}`, userStats);
    
    // Create notification
    const notification = {
      id: crypto.randomUUID(),
      user_id: user.id,
      type: 'upload_created',
      title: 'Material shared successfully',
      message: `Your "${upload.title}" is now available for the community`,
      related_id: upload.id,
      is_read: false,
      created_at: new Date().toISOString()
    };
    await kv.set(`notification:${user.id}:${notification.id}`, notification);
    
    return c.json({ message: 'Upload created successfully', upload });
  } catch (error) {
    console.error('Error creating upload:', error);
    return c.json({ error: 'Failed to create upload' }, 500);
  }
};

export const getUploads = async (c: any) => {
  try {
    const uploads = await kv.getByPrefix('upload:');
    const now = new Date();
    
    const activeUploads = uploads
      .filter(upload => 
        upload.status === 'active' && 
        !upload.is_acquired &&
        (!upload.expires_at || new Date(upload.expires_at) > now)
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    const enhancedUploads = activeUploads.map(upload => ({
      ...upload,
      is_expired: upload.expires_at ? new Date(upload.expires_at) <= now : false,
      days_remaining: upload.expires_at ? Math.max(0, Math.ceil((new Date(upload.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null
    }));
    
    return c.json(enhancedUploads);
  } catch (error) {
    console.error('Error fetching uploads:', error);
    return c.json({ error: 'Failed to fetch uploads' }, 500);
  }
};

export const getUserUploads = async (c: any) => {
  try {
    const user = c.get('user');
    const userUploadIds = await kv.get(`user_uploads:${user.id}`) || [];
    
    const uploads = [];
    for (const uploadId of userUploadIds) {
      const upload = await kv.get(`upload:${uploadId}`);
      if (upload) {
        const now = new Date();
        uploads.push({
          ...upload,
          is_expired: upload.expires_at ? new Date(upload.expires_at) <= now : false,
          days_remaining: upload.expires_at ? Math.max(0, Math.ceil((new Date(upload.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : null
        });
      }
    }
    
    return c.json(uploads);
  } catch (error) {
    console.error('Error fetching user uploads:', error);
    return c.json({ error: 'Failed to fetch user uploads' }, 500);
  }
};

export const updateUpload = async (c: any) => {
  try {
    const user = c.get('user');
    const uploadId = c.req.param('id');
    const updates = await c.req.json();
    
    const existingUpload = await kv.get(`upload:${uploadId}`);
    if (!existingUpload) {
      return c.json({ error: 'Upload not found' }, 404);
    }
    
    if (existingUpload.user_id !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    const updatedUpload = {
      ...existingUpload,
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    await kv.set(`upload:${uploadId}`, updatedUpload);
    
    return c.json({ message: 'Upload updated successfully', upload: updatedUpload });
  } catch (error) {
    console.error('Error updating upload:', error);
    return c.json({ error: 'Failed to update upload' }, 500);
  }
};

export const deleteUpload = async (c: any) => {
  try {
    const user = c.get('user');
    const uploadId = c.req.param('id');
    
    const existingUpload = await kv.get(`upload:${uploadId}`);
    if (!existingUpload) {
      return c.json({ error: 'Upload not found' }, 404);
    }
    
    if (existingUpload.user_id !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }
    
    await kv.del(`upload:${uploadId}`);
    
    // Remove from user's uploads list
    const userUploads = await kv.get(`user_uploads:${user.id}`) || [];
    const updatedUploads = userUploads.filter((id: string) => id !== uploadId);
    await kv.set(`user_uploads:${user.id}`, updatedUploads);
    
    // Create deletion notification
    const notification = {
      id: crypto.randomUUID(),
      user_id: user.id,
      type: 'upload_deleted',
      title: 'Material removed',
      message: `Your "${existingUpload.title}" has been removed from the marketplace`,
      related_id: uploadId,
      is_read: false,
      created_at: new Date().toISOString()
    };
    await kv.set(`notification:${user.id}:${notification.id}`, notification);
    
    return c.json({ message: 'Upload deleted successfully' });
  } catch (error) {
    console.error('Error deleting upload:', error);
    return c.json({ error: 'Failed to delete upload' }, 500);
  }
};

export const uploadFile = async (c: any) => {
  try {
    const user = c.get('user');
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('type') as string || 'upload';
    
    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = fileType === 'reference' ? 3 * 1024 * 1024 : 10 * 1024 * 1024; // 3MB for reference, 10MB for uploads
    
    const validationErrors = validateFileUpload(file, maxSize, allowedTypes);
    if (validationErrors.length > 0) {
      return c.json({ error: validationErrors.join(', ') }, 400);
    }
    
    const fileName = `${user.id}/${Date.now()}-${file.name}`;
    const bucketName = fileType === 'reference' ? 'make-6ad03eec-reference-images' : 'make-6ad03eec-uploads';
    
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, uint8Array, {
        contentType: file.type,
        cacheControl: '3600'
      });
    
    if (error) {
      console.error('Storage upload error:', error);
      return c.json({ error: 'Failed to upload file' }, 500);
    }
    
    const { data: signedUrlData } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 3600);
    
    return c.json({
      message: 'File uploaded successfully',
      path: data.path,
      url: signedUrlData?.signedUrl,
      fileName: file.name,
      size: file.size,
      type: file.type
    });
  } catch (error) {
    console.error('File upload error:', error);
    return c.json({ error: 'Failed to upload file' }, 500);
  }
};

// Register upload routes
export const registerUploadRoutes = (app: any) => {
  app.post("/make-server-6ad03eec/uploads", validateAuth, createUpload);
  app.get("/make-server-6ad03eec/uploads", getUploads);
  app.get("/make-server-6ad03eec/uploads/user", validateAuth, getUserUploads);
  app.put("/make-server-6ad03eec/uploads/:id", validateAuth, updateUpload);
  app.delete("/make-server-6ad03eec/uploads/:id", validateAuth, deleteUpload);
  app.post("/make-server-6ad03eec/upload-file", validateAuth, uploadFile);
};