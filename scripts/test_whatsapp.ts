import { sendInvoiceWhatsApp } from '../src/lib/invoice';
import { prisma } from '../src/lib/prisma';

async function runTest() {
  console.log('Initializing WhatsApp template test...');
  
  // 1. Find a recent quote to test with
  let fetchedQuote = await prisma.quote.findFirst({
    where: { status: 'payment_completed' }
  });

  let quote: any;

  if (!fetchedQuote) {
    console.log('No completed quotes found. Using a mockup test quote.');
    quote = {
      id: 'test_id_123',
      quoteNumber: 'TEST999',
      userId: null,
      deviceId: null,
      basePriceUsed: 15000,
      conditionAnswers: null,
      rulesVersion: 1,
      breakdown: null,
      quoteType: 'instant',
      expiresAt: null,
      status: 'payment_completed',
      images: [],
      brand: 'Apple',
      model: 'iPhone 13 Pro',
      storage: '256GB',
      condition: 'Excellent',
      screenCracked: false,
      batteryHealth: 88,
      cameraIssue: false,
      fingerprintIssue: false,
      faceIdIssue: false,
      bodyDamage: false,
      speakerIssue: false,
      chargingPortIssue: false,
      estimatedPrice: 35000,
      finalPrice: 34000,
      customerName: 'Shibam Mohanty',
      customerAddress: 'Budh Vihar Phase 1, Delhi',
      customerPincode: '110086',
      contactNumber: '9318411796', // Integrated/Test destination number
      paymentMode: 'UPI',
      description: 'Test run',
      pickupDate: new Date(),
      agentId: null,
      paymentMethod: 'UPI',
      payoutDetails: {
        payoutId: 'payout_test_abc123',
        utr: 'UTR998877665544',
        method: 'UPI',
        status: 'SUCCESS',
        date: new Date().toLocaleString('en-IN')
      },
      payoutMethod: 'UPI',
      upiId: 'shibam@upi',
      bankAccount: null,
      bankIfsc: null,
      bankAccountHolder: null,
      isDelayed: false,
      delayReason: null,
      invoicePdf: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  } else {
    quote = fetchedQuote;
    // Override the phone number for the test dispatch to avoid spamming actual users
    quote.contactNumber = '9318411796';
  }

  console.log(`Using Quote: ${quote.quoteNumber} for Customer: ${quote.customerName}`);
  
  try {
    const url = await sendInvoiceWhatsApp(quote);
    console.log('✔ SUCCESS!');
    console.log('PDF Invoice URL:', url);
    console.log('WhatsApp message outbound request successfully sent to Msg91 API!');
  } catch (err) {
    console.error('❌ WhatsApp dispatch test failed:', err);
  }
}

runTest()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
