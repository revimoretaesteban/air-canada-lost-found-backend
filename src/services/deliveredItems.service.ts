import mongoose, { Types, Document } from 'mongoose';
import DeliveredItemModel, { IDeliveredItem } from '../models/DeliveredItem';
import LostItemModel, { ILostItem } from '../models/LostItem';
import { DeliveryData } from '../types/DeliveryData';

export class DeliveredItemsService {
  async markAsDelivered(
    item: ILostItem & { _id: Types.ObjectId },
    deliveryInfo: DeliveryData,
    deliveredBy: Types.ObjectId
  ): Promise<IDeliveredItem> {
    try {
      const deliveredItem = await this.createDeliveredItem(item, {
        name: deliveryInfo.customerName,
        email: deliveryInfo.customerEmail,
        phone: deliveryInfo.customerPhone,
        deliveryDate: new Date()
      });

      // Update the original item's status
      await LostItemModel.findByIdAndUpdate(item._id, {
        status: 'delivered',
        deliveredBy,
        deliveredAt: new Date()
      });

      return deliveredItem;
    } catch (error) {
      throw error;
    }
  }

  async getDeliveredItems(): Promise<IDeliveredItem[]> {
    try {
      return await DeliveredItemModel.find().populate('foundBy');
    } catch (error) {
      console.error('Error in getDeliveredItems:', error);
      throw error;
    }
  }

  async createDeliveredItem(
    lostItem: ILostItem & { _id: Types.ObjectId },
    customerInfo: any
  ): Promise<IDeliveredItem> {
    try {
      const deliveredItemData = {
        itemName: lostItem.itemName,
        description: lostItem.description,
        location: lostItem.location,
        category: lostItem.category,
        images: lostItem.images,
        foundBy: lostItem.foundBy,
        flightNumber: lostItem.flightNumber,
        dateFound: lostItem.dateFound,
        dateDelivered: new Date(),
        archived: false,
        customerInfo: {
          ...customerInfo,
          deliveryDate: new Date()
        }
      };

      const deliveredItem = new DeliveredItemModel(deliveredItemData);
      await deliveredItem.save();
      return deliveredItem;
    } catch (error) {
      throw error;
    }
  }
}

export default new DeliveredItemsService();
