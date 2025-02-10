import express, { Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import { auth, checkRole, createAuthenticatedHandler, AuthenticatedRequest } from '../middleware/auth';
import DeliveredItem from '../models/DeliveredItem';
import LostItem from '../models/LostItem';
import cloudinaryService from '../services/cloudinary.service';
import mongoose from 'mongoose';

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

// Search delivered items
router.get('/search', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const searchTerm = req.query.searchTerm as string;
    const includeArchived = req.query.includeArchived === 'true';
    
    let query: any = {};
    
    // If user is not admin or supervisor, only show their own items
    if (req.user && req.user.role !== 'admin' && req.user.role !== 'supervisor') {
      query.foundBy = req.user._id;
    }

    if (searchTerm) {
      query.$or = [
        { flightNumber: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { 'customerInfo.name': { $regex: searchTerm, $options: 'i' } },
        { 'customerInfo.email': { $regex: searchTerm, $options: 'i' } },
        { 'customerInfo.phone': { $regex: searchTerm, $options: 'i' } }
      ];
    }

    if (!includeArchived) {
      query.archived = { $ne: true };
    }

    const items = await DeliveredItem.find(query)
      .populate({
        path: 'foundBy',
        select: 'firstName lastName employeeNumber',
        options: { allowEmptyPaths: true }
      })
      .populate({
        path: 'deliveredBy',
        select: 'firstName lastName employeeNumber',
        options: { allowEmptyPaths: true }
      })
      .sort({ dateDelivered: -1 });

    // Clean up any items with missing user references
    const cleanedItems = items.map(item => {
      const cleanedItem = item.toObject();

      if (!cleanedItem.foundBy || typeof cleanedItem.foundBy === 'string') {
        cleanedItem.foundBy = {
          _id: new mongoose.Types.ObjectId(),
          firstName: 'Unknown',
          lastName: 'User',
          employeeNumber: 'N/A'
        };
      }
      
      if (!cleanedItem.deliveredBy || typeof cleanedItem.deliveredBy === 'string') {
        cleanedItem.deliveredBy = {
          _id: new mongoose.Types.ObjectId(),
          firstName: 'Unknown',
          lastName: 'User',
          employeeNumber: 'N/A'
        };
      }
      
      return cleanedItem;
    });

    res.json(cleanedItems);
  } catch (error) {
    console.error('Error searching delivered items:', error);
    res.status(500).json({ 
      message: 'Error searching delivered items',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Get all delivered items
router.get('/', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query: any = {};
    
    // If user is not admin or supervisor, only show their own items
    if (req.user && req.user.role !== 'admin' && req.user.role !== 'supervisor') {
      query.foundBy = req.user._id;
    }
    
    const items = await DeliveredItem.find(query)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber')
      .sort({ dateDelivered: -1 });
    res.json(items);
  } catch (error) {
    console.error('Error getting delivered items:', error);
    res.status(500).json({ message: 'Error getting delivered items' });
  }
}));

// Get all delivered items for the current user
router.get('/my', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await DeliveredItem.find({ foundBy: req.user?._id })
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber')
      .sort({ dateDelivered: -1 });
    res.json(items);
  } catch (error) {
    console.error('Error getting user delivered items:', error);
    res.status(500).json({ message: 'Error getting delivered items' });
  }
}) as RequestHandler);

// Get a specific delivered item
router.get('/:id', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await DeliveredItem.findById(req.params.id)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber');

    if (!item) {
      return res.status(404).json({ message: 'Delivered item not found' });
    }

    // Check if user has permission to view this item
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && 
        item.foundBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this item' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error getting delivered item:', error);
    res.status(500).json({ message: 'Error getting delivered item' });
  }
}) as RequestHandler);

// Update a delivered item
router.put('/:id', auth, upload.array('photos', 5), createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await DeliveredItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Delivered item not found' });
    }

    // Check if user has permission to update this item
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && 
        item.foundBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this item' });
    }

    const { status, dateFound, ...otherUpdates } = req.body;
    const updates = {
      ...otherUpdates,
      dateFound: dateFound ? new Date(dateFound) : item.dateFound || new Date(),
      ...(status && { status: normalizeStatus(status) })
    };

    // Handle file uploads if any
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      // Delete old photos from Cloudinary
      for (const photo of item.images) {
        if (photo.publicId) {
          await cloudinaryService.deleteFile(photo.publicId);
        }
      }

      // Upload new photos to Cloudinary
      const uploadPromises = req.files.map(async (file) => {
        return await cloudinaryService.uploadFile(
          file.buffer,
          file.mimetype,
          file.originalname,
          'delivered',
          item.flightNumber
        );
      });

      const newPhotos = await Promise.all(uploadPromises);
      item.images = newPhotos;
    }

    // Update other fields
    Object.assign(item, updates);
    await item.save();

    const updatedItem = await DeliveredItem.findById(req.params.id)
      .populate('foundBy', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber');

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating delivered item:', error);
    res.status(500).json({ message: 'Error updating delivered item' });
  }
}) as RequestHandler);

// Delete a delivered item
router.delete('/:id', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await DeliveredItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Delivered item not found' });
    }

    // Check if user has permission to delete this item
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && 
        item.foundBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this item' });
    }

    // Delete images from Cloudinary if they exist
    if (item.images && item.images.length > 0) {
      const deletePromises = item.images.map(async (image) => {
        if (image.publicId) {
          try {
            await cloudinaryService.deleteFile(image.publicId);
          } catch (error) {
            console.error(`Failed to delete image ${image.publicId} from Cloudinary:`, error);
          }
        }
      });
      await Promise.all(deletePromises);
    }

    // Delete the item from database
    await item.deleteOne();
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting delivered item:', error);
    res.status(500).json({ 
      message: 'Error deleting item', 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
}) as RequestHandler);

// Revert delivered item to on hand (admin only)
router.post('/:id/revert', auth, checkRole(['admin']), createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
 try {
    const deliveredItem = await DeliveredItem.findById(req.params.id);
    if (!deliveredItem) {
      return res.status(404).json({ message: 'Delivered item not found' });
    }

    // Create a new lost item from the delivered item
    const lostItem = new LostItem({
      itemName: deliveredItem.itemName,
      flightNumber: deliveredItem.flightNumber,
      description: deliveredItem.description,
      location: deliveredItem.location,
      category: deliveredItem.category,
      images: deliveredItem.images,
      foundBy: deliveredItem.foundBy,
      supervisor: req.user._id, // Set the current user as supervisor
      dateFound: deliveredItem.dateDelivered, 
    });

    await lostItem.save();

    // Delete the delivered item
    await deliveredItem.deleteOne();

    res.json({ message: 'Item reverted successfully', item: lostItem });
  } catch (error) {
    console.error('Error reverting delivered item:', error);
    res.status(500).json({ message: 'Error reverting item' });
  }
}) as RequestHandler);

export default router;
