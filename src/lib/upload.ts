
import cloudinary from 'cloudinary';

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function uploadToCloudinary(file: Buffer | string, options: { public_id?: string; folder?: string } = {}) {
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.v2.uploader.upload_stream(
        {
          folder: options.folder || 'wewedrop',
          public_id: options.public_id,
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(file);
    });

    return result as { secure_url: string; public_id: string };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload image');
  }
}
