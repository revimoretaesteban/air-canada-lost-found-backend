import express, { Request, Response, RequestHandler } from 'express';
import { body } from 'express-validator';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import Permission, { IPermission } from '../models/Permission';
import { auth, AuthenticatedRequest, createAuthenticatedHandler } from '../middleware/auth';

const router = express.Router();

// Register route
router.post('/register',
  [
    body('employeeNumber').notEmpty(),
    body('password').isLength({ min: 6 }),
    body('firstName').notEmpty(),
    body('lastName').notEmpty(),
  ],
  (async (req: Request, res: Response) => {
    try {
      const { employeeNumber, password, firstName, lastName } = req.body;
      
      const existingUser = await User.findOne({ employeeNumber });
      if (existingUser) {
        return res.status(400).json({ message: 'Employee number already exists' });
      }

      const user = new User({
        employeeNumber,
        password,
        firstName,
        lastName,
        role: 'employee', // Default role
      });

      await user.save();

      const tokenPayload = {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        role: user.role,
      };

      const token = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET || 'your-secret-key',
        { 
          expiresIn: '24h',
          algorithm: 'HS256'
        }
      );

      // Return user without password
      const userResponse = {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      };

      res.status(201).json({ user: userResponse, token });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Error creating user' });
    }
}) as RequestHandler);

// Login route
router.post('/login', (async (req: Request, res: Response) => {
  try {
    const { employeeNumber, password } = req.body;

    // Find user by employee number
    const user = await User.findOne({ employeeNumber });
    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    // Return user info and token
    res.json({
      user: {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Error during login',
      code: 'LOGIN_ERROR'
    });
  }
}) as RequestHandler);

// Get current user route
router.get('/me', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    res.json(user);
  } catch (error) {
    console.error('Error in /me route:', error);
    res.status(500).json({
      message: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
}));

// Change password route
router.post('/change-password', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Find user
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        message: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      message: 'Error changing password',
      code: 'PASSWORD_ERROR'
    });
  }
}));

// Get available permissions
router.get('/permissions', async (req: Request, res: Response) => {
  try {
    const permissions = [
      { name: 'view_dashboard', description: 'View the dashboard' },
      { name: 'view_all_items', description: 'View all lost and found items' },
      { name: 'view_own_items', description: 'View items you created' },
      { name: 'create_items', description: 'Create new lost and found items' },
      { name: 'edit_all_items', description: 'Edit any lost and found item' },
      { name: 'edit_own_items', description: 'Edit items you created' },
      { name: 'delete_all_items', description: 'Delete any lost and found item' },
      { name: 'delete_own_items', description: 'Delete items you created' },
      { name: 'manage_users', description: 'Manage system users' },
      { name: 'generate_reports', description: 'Generate system reports' },
      { name: 'deliver_items', description: 'Mark items as delivered' },
      { name: 'view_delivered_items', description: 'View delivered items' }
    ];
    res.json({ permissions });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Error fetching permissions' });
  }
});

// Get all system permissions
router.get('/system-permissions', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const permissions = await Permission.find();
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Error fetching permissions' });
  }
}));

// Update user permissions (admin only)
router.put('/users/:userId/permissions', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if requesting user is admin
    const requestingUser = await User.findById(req.user._id);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { userId } = req.params;
    const { permissions } = req.body;

    // Validate all permissions exist in system by name
    const validPermissions = await Permission.find({ name: { $in: permissions } });
    if (validPermissions.length !== permissions.length) {
      return res.status(400).json({ message: 'Invalid permissions provided' });
    }

    // Update user permissions with permission document references
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { permissions: validPermissions.map(p => p._id) } },
      { new: true }
    ).populate('permissions');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Log permission update
    console.log(`Updated permissions for user ${user.employeeNumber}:`, 
      validPermissions.map(p => p.name));

    res.json({ 
      user: {
        _id: user._id,
        employeeNumber: user.employeeNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions
      }
    });

  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({ message: 'Error updating permissions' });
  }
}));

// Get user permissions
router.get('/users/:userId/permissions', auth, createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if the requesting user is an admin
    const requestingUser = await User.findById(req.user._id);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can view permissions' });
    }

    const { userId } = req.params;

    // Find the user
    const user = await User.findById(userId).populate('permissions');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user permissions
    const userResponse = {
      _id: user._id,
      employeeNumber: user.employeeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: user.permissions
    };

    res.json({ user: userResponse });
  } catch (error) {
    console.error('Error getting permissions:', error);
    res.status(500).json({ message: 'Error getting permissions' });
  }
}));

export default router;
