import { Router, Request, Response, NextFunction } from 'express';
import { auth, AuthenticatedRequest, createAuthenticatedHandler } from '../middleware/auth';
import multer, { Multer } from 'multer';
import { uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService';
import LostItem from '../models/LostItem';
import { Types } from 'mongoose';

interface CloudinaryUploadResult {
  public_id: string;
  url: string;
  secure_url: string;
}

interface ExpressMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
  buffer: Buffer;
}

const router = Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Create new item
router.post('/', auth, upload.array('images', 5), createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { flightNumber, dateFound, location, description, category } = req.body;
    const files = req.files as (ExpressMulterFile & { stream: any })[];

    // Upload images to Cloudinary
    const uploadPromises = files.map(file => uploadToCloudinary(file));
    const uploadedImages = await Promise.all(uploadPromises);

    const images = uploadedImages.map((result: CloudinaryUploadResult) => ({
      publicId: result.public_id,
      url: result.secure_url
    }));

    const item = new LostItem({
      flightNumber,
      dateFound: new Date(dateFound),
      location,
      description,
      category,
      images,
      foundBy: req.user._id,
      status: 'onHand'
    });

    await item.save();
    
    const savedItem = await LostItem.findById(item._id)
      .populate('foundBy', 'firstName lastName employeeNumber');

    res.status(201).json(savedItem);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ 
      message: 'Error creating item',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Get all items
router.get('/', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await LostItem.find()
      .populate('foundBy', 'firstName lastName employeeNumber')
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Error fetching items' });
  }
}));

// Get single item
router.get('/:id', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await LostItem.findById(req.params.id)
      .populate('foundBy', 'firstName lastName employeeNumber');
    
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ message: 'Error fetching item' });
  }
}));

// Update item
router.put('/:id', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await LostItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Update the item fields
    Object.assign(item, req.body);
    await item.save();

    const updatedItem = await LostItem.findById(req.params.id)
      .populate('foundBy', 'firstName lastName employeeNumber');

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Error updating item' });
  }
}));

// Delete item
router.delete('/:id', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await LostItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Delete images from Cloudinary
    for (const image of item.images) {
      if (image.publicId) {
        try {
          await deleteFromCloudinary(image.publicId);
        } catch (deleteError) {
          console.error('Error deleting image from Cloudinary:', deleteError);
          // Continue with deletion even if image deletion fails
        }
      }
    }

    await item.deleteOne();
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Error deleting item' });
  }
}));

// Search items
router.get('/search/:term', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { term } = req.params;
    const items = await LostItem.find({
      $or: [
        { flightNumber: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { category: { $regex: term, $options: 'i' } },
        { location: { $regex: term, $options: 'i' } }
      ]
    })
    .populate('foundBy', 'firstName lastName employeeNumber');

    res.json(items);
  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({ message: 'Error searching items' });
  }
}));

export default router;
