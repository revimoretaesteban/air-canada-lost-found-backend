import express, { Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import { auth, AuthenticatedRequest, isAuthenticated } from '../middleware/auth';
import LostItem from '../models/LostItem';
import cloudinaryService from '../services/cloudinary.service';
import { Types } from 'mongoose';

const router = express.Router();

// Configure multer for file upload
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to normalize status
const normalizeStatus = (status: string): string => {
  const statusMap: { [key: string]: string } = {
    'on-hand': 'onHand',
    'in-process': 'inProcess',
    'delivered': 'delivered'
  };
  return statusMap[status.toLowerCase()] || status;
};

// Get all items
router.get('/', auth, (async (req: Request, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const query: any = {};
    
    // All roles can view all items
    // Only restrict editing/deleting based on role

    return LostItem.find(query)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .sort({ dateFound: -1 })
      .then(items => res.json(items))
      .catch(error => {
        console.error('Error getting items:', error);
        res.status(500).json({ message: 'Error getting items' });
      });
  } catch (error) {
    console.error('Error getting items:', error);
    return res.status(500).json({ message: 'Error getting items' });
  }
}) as RequestHandler);

// Get item by ID
router.get('/:id', auth, (async (req: Request, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    return LostItem.findById(req.params.id)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .then(item => {
        if (!item) {
          return res.status(404).json({ message: 'Item not found' });
        }

        // All authenticated users can view items
        return res.json(item);
      });
  } catch (error) {
    console.error('Error getting item:', error);
    return res.status(500).json({ message: 'Error getting item' });
  }
}) as RequestHandler);

// Upload images for an item
router.post('/:id/images', auth, upload.array('images', 5), async (req: Request, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const item = await LostItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if user has permission to update this item
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && 
        item.foundBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this item' });
    }

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ message: 'No images provided' });
    }

    // Upload new images to cloudinary
    const uploadPromises = req.files.map(file => 
      cloudinaryService.uploadFile(
        file.buffer,
        file.mimetype,
        file.originalname,
        'lost',
        item.flightNumber
      )
    );

    const uploadedImages = await Promise.all(uploadPromises);
    
    // Add new images to the existing ones
    item.images = [...item.images, ...uploadedImages];
    
    const updatedItem = await item.save();
    const populatedItem = await LostItem.findById(updatedItem._id)
      .populate('foundBy', 'firstName lastName employeeNumber');
    
    return res.json(populatedItem);
  } catch (error) {
    console.error('Error uploading images:', error);
    return res.status(500).json({ message: 'Error uploading images' });
  }
});

// Create new item
router.post('/', auth, upload.array('photos', 5), (async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  const { itemName, description, location, category, flightNumber, dateFound } = req.body;

  // Handle file uploads if any
  const images: { url: string; publicId: string }[] = [];
  const processFiles = async () => {
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      // Upload photos to Cloudinary
      const uploadPromises = req.files.map(file => 
        cloudinaryService.uploadFile(
          file.buffer,
          file.mimetype,
          file.originalname,
          'lost',
          flightNumber
        )
      );

      const uploadedImages = await Promise.all(uploadPromises);
      images.push(...uploadedImages);
    }
  };

  return processFiles()
    .then(() => {
      // Create new item
      const item = new LostItem({
        itemName,
        description,
        location,
        category,
        flightNumber,
        dateFound: dateFound ? new Date(dateFound) : new Date(),
        foundBy: req.user?._id,
        images,
        status: 'onHand'
      });

      return item.save();
    })
    .then(item => LostItem.findById(item._id).populate('foundBy', 'firstName lastName employeeNumber'))
    .then(populatedItem => res.status(201).json(populatedItem))
    .catch(error => {
      console.error('Error creating item:', error);
      return res.status(500).json({ message: 'Error creating item' });
    });
}) as RequestHandler);

// Update item
router.put('/:id', auth, upload.array('photos', 5), (async (req: Request, res: Response) => {
  try {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const item = await LostItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if user exists and has permission to update this item
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && 
        item.foundBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this item' });
    }

    const { status, dateFound, ...otherUpdates } = req.body;
    const updates = {
      ...otherUpdates,
      dateFound: dateFound ? new Date(dateFound) : item.dateFound,
      ...(status && { status: normalizeStatus(status) })
    };

    // Handle file uploads if any
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const deletePromises = item.images.map(photo => 
        photo.publicId ? cloudinaryService.deleteFile(photo.publicId) : Promise.resolve()
      );
      const uploadPromises = req.files.map(file => 
        cloudinaryService.uploadFile(
          file.buffer,
          file.mimetype,
          file.originalname,
          'lost',
          item.flightNumber
        )
      );
      const [deleted, uploadedImages] = await Promise.all([Promise.all(deletePromises), Promise.all(uploadPromises)]);
      Object.assign(item, { ...updates, images: uploadedImages });
    } else {
      Object.assign(item, updates);
    }

    const updatedItem = await item.save();
    const populatedItem = await LostItem.findById(updatedItem._id).populate('foundBy', 'firstName lastName employeeNumber');
    return res.json(populatedItem);
  } catch (error) {
    console.error('Error updating item:', error);
    return res.status(500).json({ message: 'Error updating item' });
  }
}) as RequestHandler);

// Delete item
router.delete('/:id', auth, (async (req: Request, res: Response) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  return LostItem.findById(req.params.id)
    .then(item => {
      if (!item) {
        return res.status(404).json({ message: 'Item not found' });
      }

      // Check if user exists and has permission to delete this item
      if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && 
          item.foundBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to delete this item' });
      }

      // Delete images from Cloudinary if they exist
      if (item.images && item.images.length > 0) {
        return Promise.all(
          item.images.map(image => 
            image.publicId ? cloudinaryService.deleteFile(image.publicId).catch(error => {
              console.error(`Failed to delete image ${image.publicId} from Cloudinary:`, error);
            }) : Promise.resolve()
          )
        ).then(() => item);
      }
      return item;
    })
    .then(item => {
      if (!item || 'headersSent' in item) {
        throw new Error('Item not found or already deleted');
      }
      return item.deleteOne();
    })
    .then(() => res.json({ message: 'Item deleted successfully' }))
    .catch(error => {
      console.error('Error deleting item:', error);
      return res.status(500).json({ message: 'Error deleting item' });
    });
}) as RequestHandler);

export default router;
