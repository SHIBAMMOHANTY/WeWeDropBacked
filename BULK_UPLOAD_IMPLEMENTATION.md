# Bulk Order Upload Implementation Summary

## Overview
A complete bulk order upload feature has been implemented for the WeWeDropBacked application. This allows admins to upload orders in bulk via CSV, Excel, or JSON files using multer for file handling.

## Files Created/Modified

### New Files
1. **`src/app/api/orders/bulk-upload/route.ts`** - Dedicated bulk upload endpoint
   - Standalone route at `/api/orders/bulk-upload`
   - Handles all file parsing and order creation
   - Comprehensive validation and error handling

2. **`BULK_UPLOAD_DOCUMENTATION.md`** - Complete API documentation
   - Detailed API usage instructions
   - Field descriptions (required & optional)
   - CSV, JSON, and Excel format examples
   - cURL and JavaScript examples
   - Error handling and validation rules

3. **`public/samples/sample_orders.csv`** - Sample CSV file with 5 test orders

4. **`public/samples/sample_orders.json`** - Sample JSON file with 5 test orders

### Modified Files
1. **`src/app/api/orders/list/route.ts`**
   - Added imports for file parsing (csv-parse, xlsx)
   - Updated CORS headers to include POST method
   - Added `validateOrderData()` helper function
   - Added `parseFile()` helper function for multi-format support
   - Added POST handler for bulk upload integration

## Key Features

✅ **Multi-Format Support**
- CSV files (.csv)
- Excel files (.xlsx, .xls)
- JSON files (.json)

✅ **Admin-Only Access**
- Bearer token authentication
- SUPER_ADMIN role verification
- Automatic authorization checks

✅ **Comprehensive Validation**
- Required field validation
- IMEI uniqueness check
- User existence validation
- Membership type validation
- Date format validation
- Duplicate order prevention

✅ **Error Handling**
- Row-level error reporting with line numbers
- Partial success support (creates valid orders, reports failed ones)
- Detailed error messages with field names
- File format validation
- File size limit (50MB)

✅ **Data Processing**
- Automatic date parsing (ISO 8601)
- Default values for orderStatus (PENDING) and deleted (false)
- Support for all optional order fields
- Temporary file cleanup after processing

## API Endpoints

### 1. Dedicated Bulk Upload
```
POST /api/orders/bulk-upload
```

### 2. Integrated with List Route
```
POST /api/orders/list
```

Both endpoints support the same functionality and accept:
- `Authorization` header with Bearer token
- `file` form field with CSV, Excel, or JSON file

## Usage Example

### cURL
```bash
curl -X POST http://localhost:3000/api/orders/bulk-upload \
  -H "Authorization: Bearer eyJhbGc..." \
  -F "file=@sample_orders.csv"
```

### JavaScript
```javascript
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
console.log(`${result.successCount} orders created successfully`);
console.log('Errors:', result.errors);
```

## Response Format

### Success Response (HTTP 200)
```json
{
  "successCount": 5,
  "failureCount": 0,
  "errors": [],
  "successfulOrders": ["id1", "id2", "id3", "id4", "id5"],
  "summary": "Successfully created 5 orders. 0 orders failed to create."
}
```

### Partial Success Response
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
  "successfulOrders": ["id1", "id3", "id5"],
  "summary": "Successfully created 3 orders. 2 orders failed to create."
}
```

### Error Responses

**Missing Authorization**
```json
{ "error": "Missing or invalid Authorization header" }
// HTTP 401
```

**Non-Admin User**
```json
{ "error": "Only admins can perform bulk uploads" }
// HTTP 403
```

**Invalid File Type**
```json
{ "error": "Invalid file type. Only CSV, Excel (.xlsx, .xls), and JSON files are allowed." }
// HTTP 400
```

**Empty File**
```json
{ "error": "File is empty or contains no valid data" }
// HTTP 400
```

## Supported Fields

### Required Fields
- `userId` - User ID
- `membershipType` - BASIC | PREMIUM | ELITE
- `brandName` - Device brand
- `productName` - Device model
- `imeiNumber` - Unique IMEI (must not exist)
- `billImage` - URL to bill image
- `serviceDate` - ISO 8601 date
- `customerName` - Customer name
- `contactNumber` - Phone number
- `amount` - Order amount (numeric)

### Optional Fields
- `businessId` - Business ID
- `deliveryAgentId` - Delivery agent ID
- `utrScreenshot` - URL
- `invoicePdf` - URL
- `billingDate` - ISO 8601 date
- `state` - State/Province
- `pincode` - Postal code
- `fullAddress` - Delivery address
- `preferredDate` - ISO 8601 date
- `warrantyStatus` - Warranty status
- `issueType` - Issue type
- `area` - Service area
- `pickupAddress` - Pickup address
- `fix` - Fix details
- `remark` - Additional notes
- `receiverName` - Receiver name
- `mobileNumber` - Receiver phone
- `paymentId` - Payment reference
- `expireDate` - ISO 8601 date

## Technical Details

### Dependencies Used
- **multer** (^2.1.1) - File upload handling
- **csv-parse** (^6.2.1) - CSV parsing
- **xlsx** (^0.18.5) - Excel file parsing
- **fs** & **path** - Node.js file system operations

### Validation Rules
1. Each row is validated independently
2. Failed rows are skipped but reported
3. IMEI must be unique across all orders in database
4. Referenced user ID must exist
5. Membership type must be one of: BASIC, PREMIUM, ELITE
6. Dates must be in ISO 8601 format

### File Limits
- Maximum file size: 50MB
- Supported file types: .csv, .xlsx, .xls, .json
- Temporary files stored in: `public/uploads/`
- Files are cleaned up after processing

## Testing

Sample files are provided in `public/samples/`:
- `sample_orders.csv` - 5 sample orders in CSV format
- `sample_orders.json` - 5 sample orders in JSON format

### Test Steps
1. Get admin Bearer token from login endpoint
2. Upload sample file using cURL or API client
3. Check response for success count and errors
4. Verify orders are created in database using `/api/orders/list` endpoint

## Security Features

✅ **Authentication**: Bearer token required
✅ **Authorization**: SUPER_ADMIN role check
✅ **File Validation**: MIME type and extension checks
✅ **File Size Limit**: 50MB maximum
✅ **Temporary File Cleanup**: All uploaded files deleted after processing
✅ **CORS**: Properly configured with necessary headers
✅ **Rate Limiting Ready**: Can be added at nginx/gateway level

## Future Enhancements

Possible improvements:
- Add rate limiting to prevent abuse
- Implement file upload progress tracking
- Add background job processing for very large files
- Support more file formats (XML, TSV)
- Add retry logic for failed orders
- Implement order import templates with validation rules
- Add duplicate IMEI merge/update option
- Send email notifications on import completion

## Troubleshooting

### "File is empty or contains no valid data"
- Ensure CSV/Excel has at least one data row (header row required)
- Verify column headers match expected field names

### "Invalid file type"
- Supported formats: .csv, .xlsx, .xls, .json
- Check file extension and MIME type

### "User with ID XXX not found"
- Verify userId exists in the database
- Check for typos in userId field

### "Order with IMEI XXX already exists"
- IMEI must be unique
- Use different IMEI or update existing order separately

### Token expiration errors
- Get a new admin token from login endpoint
- Ensure token is not expired (7 days validity)
