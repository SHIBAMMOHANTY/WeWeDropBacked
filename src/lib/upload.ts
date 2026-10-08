
import cloudinary from 'cloudinary';

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function uploadToCloudinary(
  file: Buffer | string,
  options: {
    public_id?: string;
    folder?: string;
    background_removal?: boolean;
    format?: string;
  } = {}
) {
  try {
    const uploadOptions: any = {
      folder: options.folder || 'wewedrop',
      public_id: options.public_id,
      resource_type: 'auto',
    };

    if (options.background_removal) {
      uploadOptions.background_removal = 'cloudinary_ai';
      uploadOptions.format = options.format || 'png';
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.v2.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            // If background_removal add-on is not active, fallback to standard upload
            if (options.background_removal) {
              cloudinary.v2.uploader.upload_stream(
                {
                  folder: options.folder || 'wewedrop',
                  public_id: options.public_id,
                  resource_type: 'auto',
                },
                (retryErr, retryRes) => {
                  if (retryErr) reject(retryErr);
                  else resolve(retryRes);
                }
              ).end(file);
            } else {
              reject(error);
            }
          } else {
            resolve(result);
          }
        }
      ).end(file);
    });

    const res = result as { secure_url: string; public_id: string };

    if (options.background_removal && res.secure_url) {
      const bgRemovedUrl = res.secure_url.includes('/upload/')
        ? res.secure_url.replace('/upload/', '/upload/e_background_removal,f_png/')
        : res.secure_url;
      return {
        secure_url: bgRemovedUrl,
        raw_url: res.secure_url,
        public_id: res.public_id,
      };
    }

    return res;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload image');
  }
}
