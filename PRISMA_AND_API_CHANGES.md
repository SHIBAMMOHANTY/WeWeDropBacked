# Delivery Agent Assignment & Dynamic Config API Documentation

## 1. Prisma Schema Changes

- **Added DELIVERY_AGENT to Role enum**
- **Order model:**
  - Added `deliveryAgentId` (String?)
  - Added relation: `deliveryAgent   User? @relation(fields: [deliveryAgentId], references: [id])`

### Example (prisma/schema.prisma):
```prisma
enum Role {
  SUPER_ADMIN
  USER
  BUSINESS
  DELIVERY_AGENT
}

model Order {
  ...existing fields...
  deliveryAgentId String?
  deliveryAgent   User? @relation(fields: [deliveryAgentId], references: [id])
}
```

**Migration Required:**
- Run `npx prisma generate`
- Run `npx prisma migrate dev --name add-delivery-agent`

---

## 2. API Endpoints Added/Changed

### a. Create Delivery Agent User
- **POST /api/users/create**
- Body: `{ phone, role: "DELIVERY_AGENT", ... }`

### b. Assign Order to Delivery Agent
- **PATCH /api/orders/assign?orderId=ORDER_ID**
- Headers: `Authorization: Bearer <admin-token>`
- Body: `{ deliveryAgentId }`
- Only SUPER_ADMIN can assign.

### c. Delivery Agent Updates Pickup/Delivery
- **PATCH /api/orders/update-pickup-delivery?orderId=ORDER_ID**
- Headers: `Authorization: Bearer <agent-token>`
- Body: `{ pickupServiceCenter?: string, delivered?: boolean }`
- Only assigned DELIVERY_AGENT can update.

### d. Dynamic Membership Pricing
- **GET /api/membership/pricing** — Get all prices
- **PATCH /api/membership/pricing** — Update price for a type
  - Body: `{ type: "BASIC"|"PREMIUM"|"ELITE", price: number }`

### e. Dynamic Banner Image
- **GET /api/banner** — Get current banner image URL
- **PATCH /api/banner** — Update banner image URL
  - Body: `{ url: string }`

---

## 3. Usage Flow

1. **Admin creates delivery agent user**
2. **Admin assigns order to delivery agent**
3. **Delivery agent updates pickup location and marks as delivered**
4. **Admin can update membership prices and banner image dynamically**

---

## 4. Notes
- Membership pricing and banner image are in-memory (not persistent). For production, store in DB.
- All new endpoints are in `src/app/api/`.
- Update your Prisma schema and run migrations before using new features.

---

## 5. Migration Command Example
```sh
npx prisma generate
npx prisma migrate dev --name add-delivery-agent
```

---

For any further customization or persistence, update the relevant API route to use your database.

---

## 6. Order History & Payment Status Automation

### Schema Changes
- **Order model:**
  - Added `paymentStatus` (`Int`, default `0`) to store order-level payment status directly on the model, ensuring historical state snapshots record the payment status without external joins.

### Functionality & Features
* **Added `paymentStatus` and `paymentStatusLabel` in all history details data** (`GET /api/orders/history`).
* **Existing records checked and corrected**: Built and ran an optimized in-memory batched migration script to backfill `paymentStatus` for all `3,792` existing orders based on their payment records.
* **New data entries automatically include `paymentStatus`**.
* **Fixed missing `paymentStatus` issue** for available existing records.
* **Automated Propagation**: Changing status (`orderStatus` or `paymentStatus`) on any order automatically propagates that update to all other orders belonging to the same invoice (sharing the same `paymentId`), recording individual history logs for each sibling order.

