import { prisma } from '@/lib/prisma';
import { Device, CurrentPrice, PriceHistory } from '@prisma/client';

export class DeviceRepository {
  /**
   * Find a device by its unique slug
   */
  static async findBySlug(slug: string): Promise<Device | null> {
    return prisma.device.findUnique({
      where: { slug },
    });
  }

  /**
   * Find a device by its ID
   */
  static async findById(id: string): Promise<Device | null> {
    return prisma.device.findUnique({
      where: { id },
    });
  }

  /**
   * Get all devices in the database
   */
  static async findAll(): Promise<Device[]> {
    return prisma.device.findMany();
  }

  /**
   * Save a new device record
   */
  static async create(data: {
    slug: string;
    brand: string;
    model: string;
    display?: string;
    processor?: string;
    ram?: string;
    storage?: string;
    battery?: string;
    camera?: string;
    os?: string;
    images: string[];
    launchPrice?: number;
    releaseDate?: string;
  }): Promise<Device> {
    return prisma.device.create({
      data,
    });
  }

  /**
   * Update device specifications
   */
  static async update(
    id: string,
    data: Partial<Omit<Device, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Device> {
    return prisma.device.update({
      where: { id },
      data,
    });
  }

  /**
   * Create or update the current price for a device and seller
   */
  static async upsertCurrentPrice(data: {
    deviceId: string;
    seller: string;
    price: number;
    mrp?: number;
    availability?: string;
    productUrl?: string;
  }): Promise<CurrentPrice> {
    return prisma.currentPrice.upsert({
      where: {
        deviceId_seller: {
          deviceId: data.deviceId,
          seller: data.seller,
        },
      },
      update: {
        price: data.price,
        mrp: data.mrp,
        availability: data.availability,
        productUrl: data.productUrl,
        lastUpdated: new Date(),
      },
      create: {
        deviceId: data.deviceId,
        seller: data.seller,
        price: data.price,
        mrp: data.mrp,
        availability: data.availability,
        productUrl: data.productUrl,
        lastUpdated: new Date(),
      },
    });
  }

  /**
   * Log price history point
   */
  static async createPriceHistory(data: {
    deviceId: string;
    seller: string;
    price: number;
    mrp?: number;
  }): Promise<PriceHistory> {
    return prisma.priceHistory.create({
      data: {
        deviceId: data.deviceId,
        seller: data.seller,
        price: data.price,
        mrp: data.mrp,
        recordedAt: new Date(),
      },
    });
  }

  /**
   * Get all current prices for a device
   */
  static async getCurrentPricesByDeviceId(deviceId: string): Promise<CurrentPrice[]> {
    return prisma.currentPrice.findMany({
      where: { deviceId },
    });
  }

  /**
   * Get historical price logs for a device
   */
  static async getPriceHistoryByDeviceId(deviceId: string): Promise<PriceHistory[]> {
    return prisma.priceHistory.findMany({
      where: { deviceId },
      orderBy: { recordedAt: 'asc' },
    });
  }
}
