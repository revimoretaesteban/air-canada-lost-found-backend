import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import itemRoutes from './routes/items.routes';
import userRoutes from './routes/user.routes';
import deliveredItemsRoutes from './routes/delivered-items.routes';
import reportsRoutes from './routes/reports.routes';
import permissionRoutes from './routes/permission.routes';

// Load environment variables
const result = dotenv.config();
console.log('Environment variables loaded:', result.parsed ? 'success' : 'failed');
console.log('Environment file path:', result.parsed ? 'found' : 'not found');
console.log('Current working directory:', process.cwd());

const app = express();

// CORS configuration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://air-canada-lost-found-frontend.onrender.com');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(cors({
  origin: 'https://air-canada-lost-found-frontend.onrender.com',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/users', userRoutes);
app.use('/api/delivered-items', deliveredItemsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/permissions', permissionRoutes);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware with improved logging
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  console.error('Stack trace:', err.stack);
  console.error('Request details:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body
  });
  
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// MongoDB connection with retry logic
const connectWithRetry = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/air-canada-lost-found';
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Successfully connected to MongoDB.');
  } catch (error) {
    console.error('Failed to connect to MongoDB. Retrying in 5 seconds...', error);
    setTimeout(connectWithRetry, 5000);
  }
};

// Initialize database connection
connectWithRetry();

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('MongoDB connection established');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB connection disconnected');
});

process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error during MongoDB connection closure:', err);
    process.exit(1);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
