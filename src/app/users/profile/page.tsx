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


export default function UserProfilePage() {
  const [user, setUser] = React.useState<User | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    getUserProfile()
      .then(data => setUser(data.user))
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
"use client";
