import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { auth, checkRole, AuthenticatedRequest } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();

// Validation middleware for user creation and update
const validateUser = [
  body('employeeNumber').notEmpty().withMessage('Employee number is required'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .optional()
    .isIn(['admin', 'supervisor', 'employee'])
    .withMessage('Invalid role')
];

// Get all users
router.get('/', auth, checkRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ message: 'Error getting users' });
  }
});

// Get user by ID
router.get('/:id', auth, checkRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ message: 'Error getting user' });
  }
});

// Create new user
router.post('/', auth, checkRole(['admin']), validateUser, async (req: Request, res: Response) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeNumber, firstName, lastName, password, role = 'employee' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ employeeNumber });
    if (existingUser) {
      return res.status(400).json({ message: 'Employee number already exists' });
    }

    // Create new user
    const user = new User({
      employeeNumber,
      firstName,
      lastName,
      password,
      role
    });

    await user.save();

    // Return user without password
    const userResponse = {
      _id: user._id,
      employeeNumber: user.employeeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.status(201).json(userResponse);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Update user
router.put('/:id', auth, checkRole(['admin']), validateUser, async (req: Request, res: Response) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { employeeNumber, firstName, lastName, password, role } = req.body;

    // Find user
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user fields
    if (employeeNumber) user.employeeNumber = employeeNumber;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (password) user.password = password;
    if (role) user.role = role;

    await user.save();

    // Return updated user without password
    const userResponse = {
      _id: user._id,
      employeeNumber: user.employeeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json(userResponse);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Delete user
router.delete('/:id', auth, checkRole(['admin']), async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

export default router;
