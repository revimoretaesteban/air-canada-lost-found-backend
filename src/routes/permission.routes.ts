import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { auth, AuthenticatedRequest, createAuthenticatedHandler } from '../middleware/auth';
import Permission, { IPermission } from '../models/Permission';
import User, { IUser } from '../models/User';

const router = Router();

// Get all permissions
router.get('/', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const permissions = await Permission.find();
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Error fetching permissions' });
  }
}));

// Create a new permission
router.post('/', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    const adminUser = await User.findById(req.user._id);
    if (!adminUser?.role || adminUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create permissions' });
    }

    const { name, description } = req.body;

    // Check if permission already exists
    const existingPermission = await Permission.findOne({ name });
    if (existingPermission) {
      return res.status(400).json({
        message: 'Permission already exists',
        code: 'PERMISSION_EXISTS'
      });
    }

    // Create new permission
    const permission = new Permission({
      name,
      description,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await permission.save();

    const savedPermission = await Permission.findById(permission._id)
      .populate('createdBy', 'firstName lastName employeeNumber')
      .populate('updatedBy', 'firstName lastName employeeNumber');

    res.status(201).json(savedPermission);
  } catch (error) {
    console.error('Error creating permission:', error);
    res.status(500).json({
      message: 'Error creating permission',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Update a permission
router.put('/:id', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    const adminUser = await User.findById(req.user._id);
    if (!adminUser?.role || adminUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can update permissions' });
    }

    const { name, description } = req.body;

    // Check if permission exists
    const permission = await Permission.findById(req.params.id);
    if (!permission) {
      return res.status(404).json({
        message: 'Permission not found',
        code: 'PERMISSION_NOT_FOUND'
      });
    }

    // Update permission fields
    const updatedPermission = await Permission.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        updatedBy: req.user._id,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('createdBy', 'firstName lastName employeeNumber')
     .populate('updatedBy', 'firstName lastName employeeNumber');

    if (!updatedPermission) {
      return res.status(404).json({
        message: 'Permission not found after update',
        code: 'PERMISSION_NOT_FOUND'
      });
    }

    res.json(updatedPermission);
  } catch (error) {
    console.error('Error updating permission:', error);
    res.status(500).json({ message: 'Error updating permission' });
  }
}));

// Delete a permission
router.delete('/:id', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    const adminUser = await User.findById(req.user._id);
    if (!adminUser?.role || adminUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete permissions' });
    }

    // Check if permission exists
    const permission = await Permission.findById(req.params.id);
    if (!permission) {
      return res.status(404).json({
        message: 'Permission not found',
        code: 'PERMISSION_NOT_FOUND'
      });
    }

    // Check if permission is being used by any users
    const usersWithPermission = await User.find({ permissions: permission._id });
    if (usersWithPermission.length > 0) {
      return res.status(400).json({
        message: 'Permission is in use and cannot be deleted',
        code: 'PERMISSION_IN_USE',
        users: usersWithPermission.map(user => ({
          id: user._id instanceof mongoose.Types.ObjectId ? user._id.toString() : user._id,
          name: `${user.firstName} ${user.lastName}`,
          employeeNumber: user.employeeNumber
        }))
      });
    }

    await permission.deleteOne();
    res.json({ message: 'Permission deleted successfully' });
  } catch (error) {
    console.error('Error deleting permission:', error);
    res.status(500).json({ message: 'Error deleting permission' });
  }
}));

export default router;
