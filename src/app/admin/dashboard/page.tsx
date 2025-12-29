
import React from 'react'
import { prisma } from '@/lib/prisma'
import styles from './page.module.css'

async function getDbStatus() {
  try {
    const res = await fetch('http://localhost:3000/api/db-status', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch (e) {
    return { connected: false, message: 'Could not check DB status' };
  }
}

function formatDate(d: Date | string | null) {
  if (!d) return '-'
  const date = new Date(d)
  return date.toLocaleString()
}

const PAGE_SIZE = 10;

// Pagination component must be outside the main component
function Pagination({ page, total, pageSize }: { page: number, total: number, pageSize: number }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const prev = page > 1 ? page - 1 : 1;
  const next = page < totalPages ? page + 1 : totalPages;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '12px 0' }}>
      <a href={`?userPage=${prev}`} style={{ padding: '4px 10px', borderRadius: 6, background: page === 1 ? '#e5e7eb' : '#f1f5f9', color: '#334155', textDecoration: 'none', pointerEvents: page === 1 ? 'none' : undefined }}>Prev</a>
      <span style={{ padding: '4px 10px', color: '#334155', fontWeight: 600 }}>Page {page} of {totalPages}</span>
      <a href={`?userPage=${next}`} style={{ padding: '4px 10px', borderRadius: 6, background: page === totalPages ? '#e5e7eb' : '#f1f5f9', color: '#334155', textDecoration: 'none', pointerEvents: page === totalPages ? 'none' : undefined }}>Next</a>
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams?: { [key: string]: string | string[] } }) {
  const dbStatus = await getDbStatus();
  // Pagination logic
  const page = searchParams?.userPage ? parseInt(searchParams.userPage as string) : 1;
  const skip = (page - 1) * PAGE_SIZE;
  const [users, totalUsers] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { orders: true, payments: true },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.user.count(),
  ]);

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: true, business: true, payments: true },
  })

  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: true, order: true },
  })

  const businesses = await prisma.business.findMany({ orderBy: { createdAt: 'desc' } })

  // membership summary
  const membershipCounts = users.reduce((acc, u) => {
    const key = u.membership ?? 'NONE';
    // @ts-ignore
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className={styles.container}>
      <div className={styles.heading}>
        <div className={styles.title}>Admin Dashboard</div>
      </div>
      <div style={{ margin: '12px 0', padding: '8px 16px', borderRadius: 6, background: dbStatus.connected ? '#e0ffe0' : '#ffe0e0', color: dbStatus.connected ? '#155724' : '#721c24', fontWeight: 500 }}>
        DB Status: {dbStatus.connected ? '✅ Connected' : '❌ Not Connected'} — {dbStatus.message}
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Membership Summary</div>
        <div className={styles.summary}>
          {Object.entries(membershipCounts).map(([k, v]) => (
            <div key={k} className={styles.card}>
              <div className={styles.cardLabel}>{k}</div>
              <div className={styles.cardValue}>{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Users ({totalUsers})</div>
        <div className={styles.tableWrap}>
          <div className={styles.tableInner}>
            <table>
              <thead>
                <tr>
                  <th>Sl No</th>
                  <th>Numeric ID</th>
                  <th>Phone</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Membership</th>
                  <th>Active</th>
                  <th>Orders</th>
                  <th>Payments</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id}>
                    <td className={styles.muted}>{skip + i + 1}</td>
                    <td className={styles.muted}>{u.numericId ?? '-'}</td>
                    <td>{u.phone}</td>
                    <td>{u.username ?? <span className={styles.muted}>-</span>}</td>
                    <td>{u.email ?? <span className={styles.muted}>-</span>}</td>
                    <td className={styles.muted}>{u.role}</td>
                    <td className={styles.muted}>{u.membership ?? '-'}</td>
                    <td>
                      {u.isActive ? <span className={`${styles.badge} ${styles.badgeGreen}`}>Active</span> : <span className={`${styles.badge} ${styles.badgeRed}`}>Inactive</span>}
                    </td>
                    <td className={styles.muted}>{u.orders?.length ?? 0}</td>
                    <td className={styles.muted}>{u.payments?.length ?? 0}</td>
                    <td className={styles.small}>{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={totalUsers} pageSize={PAGE_SIZE} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Order Requests ({orders.length})</div>
        <div className={styles.tableWrap}>
          <div className={styles.tableInner}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Membership</th>
                  <th>Product</th>
                  <th>IMEI</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className={styles.muted}>{o.id}</td>
                    <td>{o.user?.phone ?? '-'}</td>
                    <td className={styles.muted}>{o.membershipType}</td>
                    <td>{o.brandName} {o.productName}</td>
                    <td className={styles.muted}>{o.imeiNumber}</td>
                    <td className={styles.muted}>₹{(o.amount ?? 0) / 100}</td>
                    <td>
                      {o.status === 'DELIVERED' ? <span className={`${styles.badge} ${styles.badgeGreen}`}>Delivered</span> : <span className={`${styles.badge} ${styles.badgeYellow}`}>{o.status}</span>}
                    </td>
                    <td className={styles.small}>{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Payments ({payments.length})</div>
        <div className={styles.tableWrap}>
          <div className={styles.tableInner}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.muted}>{p.id}</td>
                    <td>{p.user?.phone ?? '-'}</td>
                    <td className={styles.muted}>{p.orderId}</td>
                    <td>₹{(p.amount ?? 0) / 100}</td>
                    <td>{p.status === 'PAID' ? <span className={`${styles.badge} ${styles.badgeGreen}`}>Paid</span> : <span className={`${styles.badge} ${styles.badgeRed}`}>{p.status}</span>}</td>
                    <td className={styles.small}>{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Businesses ({businesses.length})</div>
        <div className={styles.tableWrap}>
          <div className={styles.tableInner}>
            <table>
              <thead>
                <tr>
                  <th>Dealer</th>
                  <th>Email</th>
                  <th>Contact</th>
                  <th>Approved</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => (
                  <tr key={b.id}>
                    <td>{b.dealerName}</td>
                    <td className={styles.muted}>{b.email}</td>
                    <td className={styles.muted}>{b.contactNumber}</td>
                    <td>{b.approved ? <span className={`${styles.badge} ${styles.badgeGreen}`}>Yes</span> : <span className={`${styles.badge} ${styles.badgeRed}`}>No</span>}</td>
                    <td className={styles.small}>{formatDate(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <div className={styles.footerNote}>Tip: use pagination or search for large datasets.</div>
    </div>
  )
}
