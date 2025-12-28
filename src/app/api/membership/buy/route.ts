import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      product,
      brandName,
      imeiNumber,
      problemDesc,
      billUrl,
      date,
      customerName,
      mobileNumber,
      fullAddress, // optional
      state,
      pincode,
      referralCode // optional
    } = body

    // Basic validation (fullAddress is optional)
    if (
      !product ||
      !brandName ||
      !imeiNumber ||
      !problemDesc ||
      !billUrl ||
      !date ||
      !customerName ||
      !mobileNumber ||
      !state ||
      !pincode
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Save to DB using Order model (adjust as per your schema)
    const order = await prisma.order.create({
      data: {
        membershipType: 'BASIC', // or 'PREMIUM', set as needed
        brandName,
        productName: product,
        imeiNumber,
        billImage: billUrl,
        serviceDate: new Date(date),
        customerName,
        contactNumber: mobileNumber,
        fullAddress: fullAddress || null,
        state,
        pincode,
        // You may need to set userId, businessId, amount, etc. as per your logic
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}