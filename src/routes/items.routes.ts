import { Router, Request, Response, NextFunction } from 'express';
import { auth, AuthenticatedRequest, createAuthenticatedHandler } from '../middleware/auth';
import multer, { Multer } from 'multer';
import cloudinaryService from '../services/cloudinary.service';
import LostItem from '../models/LostItem';
import DeliveredItem from '../models/DeliveredItem';
import { Types } from 'mongoose';

interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  thumbnailUrl: string;
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
    const { flightNumber, dateFound, location, description, category, itemName, foundBy, supervisor } = req.body;
    const files = req.files as (ExpressMulterFile & { stream: any })[];

    // Upload images to Cloudinary
    const uploadPromises = files.map(file => cloudinaryService.uploadFile(file.buffer, file.mimetype, file.originalname, 'lost', flightNumber));
    const uploadedImages = await Promise.all(uploadPromises);

    const images = uploadedImages.map((result: CloudinaryUploadResult) => ({
      publicId: result.publicId,
      url: result.url,
      thumbnailUrl: result.thumbnailUrl
    }));

    const item = new LostItem({
      itemName,
      flightNumber,
      dateFound: new Date(dateFound),
      location,
      description,
      category,
      images,
      foundBy,
      supervisor,
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
    // Todos los usuarios pueden ver todos los items
    const query: any = {};

    const items = await LostItem.find(query)
      .populate({
        path: 'foundBy',
        select: 'firstName lastName employeeNumber',
        options: { allowEmptyPaths: true }
      })
      .populate({
        path: 'supervisor',
        select: 'firstName lastName employeeNumber',
        options: { allowEmptyPaths: true }
      })
      .populate({
        path: 'deliveredBy',
        select: 'firstName lastName employeeNumber',
        options: { allowEmptyPaths: true }
      })
      .sort({ createdAt: -1 });

    // Clean up any items with missing user references
    const cleanedItems = items.map(item => {
      const cleanedItem = item.toObject();

      const createPlaceholderUser = () => ({
        _id: new Types.ObjectId(),
        firstName: 'Unknown',
        lastName: 'User',
        employeeNumber: 'N/A'
      });

      if (!cleanedItem.foundBy || typeof cleanedItem.foundBy === 'string') {
        cleanedItem.foundBy = createPlaceholderUser();
      }

      if (!cleanedItem.supervisor || typeof cleanedItem.supervisor === 'string') {
        cleanedItem.supervisor = createPlaceholderUser();
      }

      if (!cleanedItem.deliveredBy || typeof cleanedItem.deliveredBy === 'string') {
        cleanedItem.deliveredBy = createPlaceholderUser();
      }

      return cleanedItem;
    });

    res.json(cleanedItems);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ 
      message: 'Error fetching items',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
    const updates = { ...req.body };
    if (updates.dateFound) {
      updates.dateFound = new Date(updates.dateFound);
    }

    // Use findByIdAndUpdate to ensure proper update
    const updatedItem = await LostItem.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).populate('foundBy', 'firstName lastName employeeNumber')
     .populate('supervisor', 'firstName lastName employeeNumber');

    if (!updatedItem) {
      return res.status(404).json({ message: 'Item not found after update' });
    }

    res.json(updatedItem);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Error updating item' });
  }
}));

// Upload images for an item
router.post('/:id/images', auth, upload.array('images', 5), createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await LostItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Check if user has permission to update this item
    if (req.user.role !== 'admin' && req.user.role !== 'supervisor' && 
        item.foundBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this item' });
    }

    const files = req.files as ExpressMulterFile[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No images provided' });
    }

    // Upload new images to cloudinary
    const uploadPromises = files.map(async (file) => {
      try {
        const result = await cloudinaryService.uploadFile(
          file.buffer,
          file.mimetype,
          file.originalname,
          'lost',
          item.flightNumber
        );
        return {
          publicId: result.publicId,
          url: result.url,
          thumbnailUrl: result.thumbnailUrl
        };
      } catch (error) {
        console.error('Error uploading to Cloudinary:', error);
        throw new Error('Failed to upload image to cloud storage');
      }
    });

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
}));

// Mark item as delivered
router.put('/:id/deliver', auth, upload.array('photos', 5), createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await LostItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const customerInfo = JSON.parse(req.body.customerInfo);
    const signature = req.body.signature;
    const files = req.files as (ExpressMulterFile & { stream: any })[];

    // Validate required fields
    if (!customerInfo.receiverName || !customerInfo.receiverEmail || 
        !customerInfo.receiverPhone || !customerInfo.receiverIdentification || !signature) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Upload delivery photos to Cloudinary if provided
    let deliveryPhotos: Array<{ publicId: string; url: string; thumbnailUrl: string }> = [];
    if (files && files.length > 0) {
      const uploadPromises = files.map(file => 
        cloudinaryService.uploadFile(file.buffer, file.mimetype, file.originalname, 'delivered', item.flightNumber)
      );
      const uploadedImages = await Promise.all(uploadPromises);
      deliveryPhotos = uploadedImages.map((result: CloudinaryUploadResult) => ({
        publicId: result.publicId,
        url: result.url,
        thumbnailUrl: result.thumbnailUrl
      }));
    }

    const currentDate = new Date();

    // Create a new delivered item
    const deliveredItem = new DeliveredItem({
      itemName: item.itemName || item.description,
      flightNumber: item.flightNumber,
      dateFound: item.dateFound,
      location: item.location,
      description: item.description,
      category: item.category,
      foundBy: item.foundBy,
      supervisor: item.supervisor,
      images: item.images,
      customerInfo: {
        name: customerInfo.receiverName,
        email: customerInfo.receiverEmail,
        phone: customerInfo.receiverPhone,
        identification: customerInfo.receiverIdentification,
        signature: signature
      },
      deliveryNotes: customerInfo.notes,
      deliveryPhotos,
      deliveredBy: req.user._id,
      dateDelivered: currentDate,
      archived: false
    });

    await deliveredItem.save();

    // Delete the original lost item
    await LostItem.findByIdAndDelete(req.params.id);

    res.json(deliveredItem);
  } catch (error) {
    console.error('Error delivering item:', error);
    res.status(500).json({ 
      message: 'Error delivering item',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
          await cloudinaryService.deleteFile(image.publicId);
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
