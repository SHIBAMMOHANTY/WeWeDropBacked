import { NextApiRequest, NextApiResponse } from "next";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: "Error parsing form data" });
      return;
    }
    const file = files.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const fileData = fs.readFileSync(file.filepath);
    const key = `banner/${Date.now()}_${file.originalFilename}`;

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: fileData,
          ContentType: file.mimetype,
        })
      );
      const fileUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_URL_BASE}/${key}`;
      res.status(200).json({ success: true, url: fileUrl });
    } catch (error) {
      res.status(500).json({ error: "Upload failed" });
    }
  });
}