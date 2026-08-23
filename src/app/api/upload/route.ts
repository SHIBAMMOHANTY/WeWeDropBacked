import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
    throw new Error("Cloudflare R2 environment variables are missing");
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
    } else {
      const body = await request.json();
      const { image, base64, name, type, folder: bodyFolder } = body;
      const rawImage = image || base64;
      if (!rawImage) {
        return Response.json({ error: "No image or base64 data provided" }, { status: 400, headers: corsHeaders });
      }

      if (bodyFolder) folder = bodyFolder;
      if (name) fileName = name;
      if (type) fileType = type;

      const base64Data = rawImage.replace(/^data:image\/\w+;base64,/, "");
      buffer = Buffer.from(base64Data, "base64");
    }

    const bucket = process.env.CLOUDFLARE_R2_BUCKET || "crm";
    const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL_BASE || "https://pub-3980550907254b0a90694547699c11dd.r2.dev";

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${folder}/${Date.now()}_${cleanFileName}`;

    const s3 = getR2Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: fileType,
      })
    );

    const fileUrl = `${publicUrlBase}/${key}`;

    return Response.json({ success: true, url: fileUrl, fileUrl }, { headers: corsHeaders });
  } catch (error: any) {
    console.error("Cloudflare R2 Upload error:", error);
    return Response.json({ success: false, error: error?.message || "Upload failed" }, { status: 500, headers: corsHeaders });
  }
}
