# Bulk Upload Quick Start Guide

## 1️⃣ Prerequisites
- Admin user account with `SUPER_ADMIN` role
- Valid Bearer token (from login endpoint)
- Orders data in one of these formats: CSV, Excel (.xlsx/.xls), or JSON

## 2️⃣ Prepare Your Data

### Option A: CSV Format
Create a file `orders.csv`:
```csv
userId,membershipType,brandName,productName,imeiNumber,billImage,serviceDate,customerName,contactNumber,amount
user001,BASIC,Samsung,Galaxy S21,123456789012345,https://example.com/bill.jpg,2024-05-01,John Doe,9876543210,500
user002,PREMIUM,Apple,iPhone 13,234567890123456,https://example.com/bill.jpg,2024-05-02,Jane Smith,9876543211,1000
```

### Option B: JSON Format
Create a file `orders.json`:
```json
[
  {
    "userId": "user001",
    "membershipType": "BASIC",
    "brandName": "Samsung",
    "productName": "Galaxy S21",
    "imeiNumber": "123456789012345",
    "billImage": "https://example.com/bill.jpg",
    "serviceDate": "2024-05-01",
    "customerName": "John Doe",
    "contactNumber": "9876543210",
    "amount": 500
  }
]
```

### Option C: Excel Format
Use columns with same headers as CSV (see sample_orders.csv)

## 3️⃣ Upload Orders

### Using cURL
```bash
curl -X POST http://localhost:3000/api/orders/bulk-upload \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "file=@orders.csv"
```

### Using Postman
1. Create new POST request to `http://localhost:3000/api/orders/bulk-upload`
2. Go to Headers tab → Add: `Authorization: Bearer YOUR_ADMIN_TOKEN`
3. Go to Body tab → Select "form-data"
4. Add key `file` with type `File` → Select your CSV/JSON/Excel file
5. Click Send

### Using JavaScript
```javascript
const fileInput = document.querySelector('input[type="file"]');
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/orders/bulk-upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + adminToken
  },
  body: formData
});

const result = await response.json();
console.log(`✅ Created: ${result.successCount}`);
console.log(`❌ Failed: ${result.failureCount}`);
if (result.errors.length > 0) {
  console.log('Errors:', result.errors);
}
```

## 4️⃣ Check Response

### Success Example ✅
```json
{
  "successCount": 5,
  "failureCount": 0,
  "errors": [],
  "successfulOrders": ["order-id-1", "order-id-2", ...],
  "summary": "Successfully created 5 orders. 0 orders failed to create."
}
```

### Partial Success Example ⚠️
```json
{
  "successCount": 3,
  "failureCount": 2,
  "errors": [
    {
      "row": 2,
      "field": "imeiNumber",
      "message": "Order with IMEI 123456789012345 already exists"
    },
    {
      "row": 4,
      "field": "userId",
      "message": "User with ID invalid_id not found"
    }
  ],
  "successfulOrders": ["order-id-1", "order-id-3", ...],
  "summary": "Successfully created 3 orders. 2 orders failed to create."
}
```

## ⚠️ Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| Missing or invalid Authorization header | No Bearer token | Add `Authorization: Bearer YOUR_TOKEN` header |
| Only admins can perform bulk uploads | User is not admin | Use SUPER_ADMIN account |
| Invalid file type | Wrong format | Use CSV, Excel (.xlsx/.xls), or JSON |
| File is empty | No data rows | Ensure at least 1 data row (after header) |
| Order with IMEI XXX already exists | Duplicate IMEI | Use unique IMEI numbers |
| User with ID XXX not found | Invalid userId | Verify user exists in database |

## 📋 Required vs Optional Fields

**MUST HAVE (Required)**
- userId
- membershipType (BASIC/PREMIUM/ELITE)
- brandName
- productName
- imeiNumber (unique)
- billImage
- serviceDate
- customerName
- contactNumber
- amount

**NICE TO HAVE (Optional)**
- businessId
- deliveryAgentId
- state
- pincode
- fullAddress
- issueType
- warrantyStatus
- ... and more (see full documentation)

## 🔄 Retry Failed Orders

If some orders failed:
1. Create a new file with only the failed orders
2. Fix the errors (e.g., use different IMEI)
3. Upload again

Example fixing IMEI duplicates:
```csv
userId,membershipType,brandName,productName,imeiNumber,billImage,serviceDate,customerName,contactNumber,amount
user006,BASIC,Nokia,3310,999888777666555,https://example.com/bill.jpg,2024-05-06,Bob Alice,9876543215,350
```

## 📝 Sample Files

Pre-made sample files available in `public/samples/`:
- `sample_orders.csv` - 5 sample orders
- `sample_orders.json` - 5 sample orders

Download and customize for your needs!

## 🆘 Need Help?

1. Check `BULK_UPLOAD_DOCUMENTATION.md` for detailed API docs
2. Review `BULK_UPLOAD_IMPLEMENTATION.md` for technical details
3. Verify data format in sample files
4. Check error messages for specific field issues
5. Ensure all required fields are present
6. Verify token hasn't expired

---

**That's it!** Your orders are now bulk uploaded. 🎉
