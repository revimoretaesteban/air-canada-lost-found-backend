import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import User from '../models/User';

// Define the structure of our JWT payload
interface JwtPayload {
  id: string;
}

// Define the structure of our authenticated request
export interface AuthenticatedRequest extends Request {
  user: {
    _id: mongoose.Types.ObjectId;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: string[];
    createdAt: Date;
    updatedAt: Date;
  }
}

// Type guard to check if request is authenticated
export function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return 'user' in req && req.user !== undefined;
}

// Helper function to create an authenticated request handler
export function createAuthenticatedHandler(
  handler: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({
        message: 'Unauthorized',
        code: 'UNAUTHORIZED'
      });
    }
    try {
      await handler(req as AuthenticatedRequest, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// Middleware to authenticate requests
export const auth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        message: 'No authentication token, authorization denied',
        code: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Convert string permissions to ObjectIds if they aren't already
    const permissions = user.permissions.map(perm => perm.toString());

    (req as AuthenticatedRequest).user = {
      _id: user._id as unknown as mongoose.Types.ObjectId,
      employeeNumber: user.employeeNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      message: 'Token is not valid',
      code: 'INVALID_TOKEN'
    });
  }
};

// Middleware to check role authorization
export const checkRole = (allowedRoles: string[]) => {
  return createAuthenticatedHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }
    next();
  });
};
