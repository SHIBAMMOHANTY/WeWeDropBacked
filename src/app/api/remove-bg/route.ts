import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { uploadToCloudinary } from "@/lib/upload";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

function getR2Client() {
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

async function processAiBackgroundRemoval(imageBuffer: Buffer): Promise<Buffer> {
  // Strategy 1: HuggingFace BRIA RMBG-1.4 Inference API (Free, high accuracy AI segmentation)
  try {
    const hfEndpoints = [
      "https://router.huggingface.co/hf-inference/models/briaai/RMBG-1.4",
      "https://api-inference.huggingface.co/models/briaai/RMBG-1.4",
    ];

    for (const endpoint of hfEndpoints) {
      try {
        const hfRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: new Uint8Array(imageBuffer),
        });

        if (hfRes.ok) {
          const contentType = hfRes.headers.get("content-type") || "";
          if (contentType.includes("image") || contentType.includes("octet-stream")) {
            const arrayBuf = await hfRes.arrayBuffer();
            if (arrayBuf.byteLength > 1000) {
              console.log(`✨ [AI RemoveBG: RMBG-1.4] Background removed successfully (${arrayBuf.byteLength} bytes)`);
              return Buffer.from(arrayBuf);
            }
          }
        }
      } catch (_) {}
    }
  } catch (err: any) {
    console.warn("⚠️ [AI RemoveBG] Error in RMBG-1.4 API:", err?.message);
  }

  return imageBuffer;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let buffer: Buffer;
    let fileName = `bg_removed_${Date.now()}.png`;
    let folder = "device_photos";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return Response.json({ error: "No file provided" }, { status: 400, headers: corsHeaders });
      }
      buffer = Buffer.from(await file.arrayBuffer());
      folder = (formData.get("folder") as string) || folder;
    } else {
      const body = await request.json();
      const { image, base64, folder: bodyFolder } = body;
      const rawImage = image || base64;
      if (!rawImage) {
        return Response.json({ error: "No image provided" }, { status: 400, headers: corsHeaders });
      }

      if (bodyFolder) folder = bodyFolder;

      let base64Clean = String(rawImage).trim();
      if (base64Clean.includes("base64,")) {
        base64Clean = base64Clean.split("base64,")[1];
      }
      base64Clean = base64Clean.replace(/[\r\n\s]+/g, "");
      buffer = Buffer.from(base64Clean, "base64");
    }

    // Process AI background removal
    const processedBuffer = await processAiBackgroundRemoval(buffer);

    let fileUrl: string | null = null;

    // Upload processed photo to Cloudflare R2
    const s3 = getR2Client();
    if (s3) {
      try {
        const bucket = process.env.CLOUDFLARE_R2_BUCKET || "crm";
        const publicUrlBase =
          process.env.CLOUDFLARE_R2_PUBLIC_URL_BASE ||
          "https://pub-3980550907254b0a90694547699c11dd.r2.dev";

        const key = `${folder}/${Date.now()}_${fileName}`;

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: processedBuffer,
            ContentType: "image/png",
          })
        );

        fileUrl = `${publicUrlBase}/${key}`;
      } catch (r2Err: any) {
        console.warn("⚠️ Cloudflare R2 upload failed, attempting Cloudinary fallback:", r2Err?.message || r2Err);
      }
    }

    if (!fileUrl) {
      try {
        const cldRes = await uploadToCloudinary(processedBuffer, { folder, background_removal: true });
        if (cldRes?.secure_url) {
          fileUrl = cldRes.secure_url;
        }
      } catch (cldErr: any) {
        console.warn("⚠️ Cloudinary fallback failed:", cldErr?.message || cldErr);
      }
    }

    return Response.json(
      {
        success: true,
        url: fileUrl,
        fileUrl: fileUrl,
        imageUrl: fileUrl,
        base64: `data:image/png;base64,${processedBuffer.toString("base64")}`,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("❌ [POST /api/remove-bg] Error:", error);
    return Response.json(
      { success: false, error: error?.message || "Failed to remove background" },
      { status: 500, headers: corsHeaders }
    );
  }
}
