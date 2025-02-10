import mongoose from 'mongoose';
import User from '../models/User';
import Permission from '../models/Permission';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/air-canada-lost-found';

async function addViewItemsPermission() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB successfully');

    // Get the view_items permission
    const viewItemsPermission = await Permission.findOne({ name: 'view_items' });
    if (!viewItemsPermission) {
      console.error('view_items permission not found');
      process.exit(1);
    }

    // Find all employee users who don't have the view_items permission
    const users = await User.find({
      role: 'employee',
      permissions: { $ne: viewItemsPermission._id }
    });

    console.log(`Found ${users.length} users without view_items permission`);

    // Add the permission to each user
    for (const user of users) {
      user.permissions = [...(user.permissions || []), viewItemsPermission._id];
      await user.save();
      console.log(`Added view_items permission to user ${user.employeeNumber}`);
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error running migration:', error);
    process.exit(1);
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  addViewItemsPermission();
}

export default addViewItemsPermission;
