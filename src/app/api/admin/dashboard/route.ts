
// TODO: implement admin dashboard route

import { NextResponse } from 'next/server';

export async function GET() {
	return NextResponse.json({ message: 'Admin dashboard endpoint' });
}
