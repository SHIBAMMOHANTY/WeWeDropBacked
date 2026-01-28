"use client";
import React from 'react';
type User = {
  id?: string;
  phone?: string;
  username?: string;
  email?: string;
  role?: string;
  membership?: string;
  isActive?: boolean;
  createdAt?: string;
};

async function getUserProfile() {
  const res = await fetch('/api/users/profile', {
    headers: {
      'Authorization': typeof window !== 'undefined' ? `Bearer ${localStorage.getItem('token')}` : '',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch user profile');
  return res.json();
}

async function getUserOrders(userId: string) {
  const res = await fetch(`/api/orders/list?userId=${userId}`, {
    headers: {
      'Authorization': typeof window !== 'undefined' ? `Bearer ${localStorage.getItem('token')}` : '',
    },
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}


export default function UserProfilePage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [orders, setOrders] = React.useState<any[]>([]);
  const [selectedOrders, setSelectedOrders] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    getUserProfile()
      .then(data => {
        setUser(data.user);
        if (data.user?.id) {
          getUserOrders(data.user.id).then(setOrders).catch(e => console.error(e));
        }
      })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!user) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px #e0e7ef', padding: 32, fontFamily: 'Inter, Arial, sans-serif' }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>User Profile</h2>
      <div style={{ display: 'grid', rowGap: 12 }}>
        <ProfileField label="User ID" value={user.id ?? <span style={{color:'#aaa'}}>N/A</span>} />
        <ProfileField label="Phone" value={user.phone ?? <span style={{color:'#aaa'}}>N/A</span>} />
        <ProfileField label="Username" value={user.username ?? <span style={{color:'#aaa'}}>N/A</span>} />
        <ProfileField label="Email" value={user.email || <span style={{color:'#aaa'}}>Not set</span>} />
        <ProfileField label="Role" value={user.role ?? <span style={{color:'#aaa'}}>N/A</span>} />
        <ProfileField label="Membership" value={user.membership || <span style={{color:'#aaa'}}>None</span>} />
        <ProfileField label="Active" value={user.isActive !== undefined ? (user.isActive ? 'Yes' : 'No') : <span style={{color:'#aaa'}}>N/A</span>} />
        <ProfileField label="Created At" value={user.createdAt ? new Date(user.createdAt).toLocaleString() : <span style={{color:'#aaa'}}>N/A</span>} />
      </div>
      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Your Orders</h3>
        {orders.length === 0 ? <p>No orders found.</p> : (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              {orders.map((order: any) => (
                <div key={order.id} style={{ display: 'flex', alignItems: 'center', border: '1px solid #e0e7ef', padding: 12, borderRadius: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectedOrders.includes(order.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedOrders([...selectedOrders, order.id]);
                      } else {
                        setSelectedOrders(selectedOrders.filter(id => id !== order.id));
                      }
                    }}
                  />
                  <div style={{ marginLeft: 12 }}>
                    <p>Order ID: {order.id}</p>
                    <p>Amount: ₹{order.amount}</p>
                    <p>Status: {order.orderStatus}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <p>Total Selected: ₹{orders.filter(o => selectedOrders.includes(o.id)).reduce((sum, o) => sum + o.amount, 0)}</p>
              <button
                onClick={async () => {
                  if (selectedOrders.length === 0) return;
                  const res = await fetch('/api/razorpay/create-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      orderIds: selectedOrders,
                      customerName: user?.username,
                      contact: user?.phone,
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    window.open(data.short_url, '_blank');
                  } else {
                    alert('Error: ' + data.message);
                  }
                }}
                style={{ padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: 4 }}
              >
                Pay Selected Orders
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
      <span style={{ color: '#64748b', fontWeight: 500 }}>{label}</span>
      <span style={{ color: '#0f172a', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
