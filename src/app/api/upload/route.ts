import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { uploadToCloudinary } from "@/lib/upload";
import { removeBackground } from "@imgly/background-removal-node";

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

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let buffer: Buffer;
    let fileName = `upload_${Date.now()}.jpg`;
    let fileType = "image/jpeg";
    let folder = "verifications";
    let shouldRemoveBg = false;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return Response.json({ error: "No file provided in form-data" }, { status: 400, headers: corsHeaders });
      }
      buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name || fileName;
      fileType = file.type || fileType;
      folder = (formData.get("folder") as string) || folder;
      const removeBgFlag = formData.get("removeBg") as string;
      shouldRemoveBg = removeBgFlag === "true" || removeBgFlag === "1";
    } else {
      const body = await request.json();
      const { image, base64, name, type, folder: bodyFolder, removeBg } = body;
      const rawImage = image || base64;
      if (!rawImage) {
        return Response.json({ error: "No image or base64 data provided" }, { status: 400, headers: corsHeaders });
      }

      if (bodyFolder) folder = bodyFolder;
      if (name) fileName = name;
      if (type) fileType = type;
      if (typeof removeBg === "boolean") {
        shouldRemoveBg = removeBg;
      }

      let base64Clean = String(rawImage).trim();
      if (base64Clean.includes("base64,")) {
        const parts = base64Clean.split("base64,");
        base64Clean = parts[1];
        const mimeMatch = parts[0].match(/data:([^;]+)/);
        if (mimeMatch && mimeMatch[1]) {
          fileType = mimeMatch[1];
          if (!name) {
            const ext = fileType.split("/")[1] || "jpg";
            fileName = `upload_${Date.now()}.${ext}`;
          }
        }
      }

      base64Clean = base64Clean.replace(/[\r\n\s]+/g, "");
      buffer = Buffer.from(base64Clean, "base64");
    }

    // Auto-enable background removal for product / device photos unless explicitly turned off
    const isProductOrDeviceFolder =
      folder.includes("device") ||
      folder.includes("product") ||
      folder.includes("refurb");

    if (shouldRemoveBg || isProductOrDeviceFolder) {
      try {
        console.log(`✨ [BgRemoval] Processing AI background removal for ${fileName}...`);
        const inputBlob = new Blob([buffer], { type: fileType || "image/jpeg" });
        const cleanBlob = await removeBackground(inputBlob);
        const arrayBuf = await cleanBlob.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        fileType = "image/png";
        fileName = fileName.replace(/\.[^/.]+$/, "") + ".png";
        console.log(`✅ [BgRemoval] Background successfully removed for ${fileName}`);
      } catch (bgErr: any) {
        console.warn("⚠️ [BgRemoval] Background removal skipped (using original buffer):", bgErr?.message || bgErr);
      }
    }

    let fileUrl: string | null = null;

    // Strategy 1: Attempt Cloudflare R2 Upload
    const s3 = getR2Client();
    if (s3) {
      try {
        const bucket = process.env.CLOUDFLARE_R2_BUCKET || "crm";
        const publicUrlBase =
          process.env.CLOUDFLARE_R2_PUBLIC_URL_BASE ||
          "https://pub-3980550907254b0a90694547699c11dd.r2.dev";

        const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${folder}/${Date.now()}_${cleanFileName}`;

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: fileType,
          })
        );

        fileUrl = `${publicUrlBase}/${key}`;
      } catch (r2Err: any) {
        console.warn("⚠️ Cloudflare R2 upload failed, attempting Cloudinary fallback:", r2Err?.message || r2Err);
      }
    }

    // Strategy 2: Fallback to Cloudinary if R2 failed or not configured
    if (!fileUrl) {
      try {
        const cldRes = await uploadToCloudinary(buffer, { folder });
        if (cldRes?.secure_url) {
          fileUrl = cldRes.secure_url;
        }
      } catch (cldErr: any) {
        console.warn("⚠️ Cloudinary fallback failed:", cldErr?.message || cldErr);
      }
    }

    if (!fileUrl) {
      throw new Error("All upload providers (R2 and Cloudinary) failed to store image");
    }

    return Response.json(
      {
        success: true,
        url: fileUrl,
        fileUrl: fileUrl,
        imageUrl: fileUrl,
        secure_url: fileUrl,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("❌ Upload error:", error);
    return Response.json(
      { success: false, error: error?.message || "Upload failed" },
      { status: 500, headers: corsHeaders }
    );
  }
}
