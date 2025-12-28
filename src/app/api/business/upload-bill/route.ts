
import { NextResponse } from 'next/server';
import { uploadToCloudinary } from '@/lib/upload';

// Example: handle POST request for business upload-bill
export async function POST(request: Request) {
	// TODO: Parse form data and get file
	// const formData = await request.formData();
	// const file = formData.get('file');
	// const result = await uploadToCloudinary(file);
	// return NextResponse.json({ url: result.secure_url });
	return NextResponse.json({ message: 'Business upload-bill endpoint (Cloudinary setup placeholder)' });
}
