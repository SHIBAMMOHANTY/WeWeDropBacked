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
    console.log(`✨ [POST /api/remove-bg] Removing background for image (${buffer.length} bytes)...`);
    const inputBlob = new Blob([buffer], { type: "image/jpeg" });
    const cleanBlob = await removeBackground(inputBlob);
    const arrayBuf = await cleanBlob.arrayBuffer();
    const resultBuffer = Buffer.from(arrayBuf);
    const resultBase64 = `data:image/png;base64,${resultBuffer.toString("base64")}`;

    let fileUrl: string | null = null;

    // Upload processed transparent PNG to Cloudflare R2
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
            Body: resultBuffer,
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
        const cldRes = await uploadToCloudinary(resultBuffer, { folder });
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
        base64: resultBase64,
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
