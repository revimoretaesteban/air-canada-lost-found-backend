import mongoose from 'mongoose';
import Permission from '../models/Permission';

const DEFAULT_PERMISSIONS = [
  {
    name: 'view_dashboard',
    description: 'View the dashboard',
    component: 'dashboard',
    action: 'view'
  },
  {
    name: 'view_items',
    description: 'View lost and found items',
    component: 'items',
    action: 'view'
  },
  {
    name: 'create_items',
    description: 'Create lost and found items',
    component: 'items',
    action: 'create'
  },
  {
    name: 'edit_all_items',
    description: 'Edit all lost and found items',
    component: 'items',
    action: 'edit_all'
  },
  {
    name: 'edit_own_items',
    description: 'Edit own lost and found items',
    component: 'items',
    action: 'edit_own'
  },
  {
    name: 'delete_all_items',
    description: 'Delete all lost and found items',
    component: 'items',
    action: 'delete_all'
  },
  {
    name: 'delete_own_items',
    description: 'Delete own lost and found items',
    component: 'items',
    action: 'delete_own'
  },
  {
    name: 'manage_users',
    description: 'Manage users',
    component: 'users',
    action: 'manage'
  },
  {
    name: 'generate_reports',
    description: 'Generate reports',
    component: 'reports',
    action: 'generate'
  },
  {
    name: 'deliver_items',
    description: 'Mark items as delivered',
    component: 'items',
    action: 'deliver'
  },
  {
    name: 'view_delivered_items',
    description: 'View delivered items',
    component: 'items',
    action: 'view_delivered'
  }
];

export async function createDefaultPermissions() {
  try {
    // Create permissions if they don't exist
    for (const permission of DEFAULT_PERMISSIONS) {
      await Permission.findOneAndUpdate(
        { name: permission.name },
        permission,
        { upsert: true, new: true }
      );
    }
    console.log('Default permissions created successfully');
  } catch (error) {
    console.error('Error creating default permissions:', error);
    throw error;
  }
}

// If running this script directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/air-canada-lost-found')
    .then(() => {
      console.log('Connected to MongoDB');
      return createDefaultPermissions();
    })
    .then(() => {
      console.log('Finished creating default permissions');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export default createDefaultPermissions;
