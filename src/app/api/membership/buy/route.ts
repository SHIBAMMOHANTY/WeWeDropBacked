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

    // Save to DB (adjust model/fields as per your schema)
    const membership = await prisma.membership.create({
      data: {
        product,
        brandName,
        imeiNumber,
        problemDesc,
        billUrl,
        date: new Date(date),
        customerName,
        mobileNumber,
        fullAddress: fullAddress || null,
        state,
        pincode,
        referralCode: referralCode || null,
      },
    })

    return NextResponse.json(membership, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}