export default async function Home() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <h1>WeWeDrop Backend</h1>
      <p>MongoDB connection is managed server-side.</p>
      <p>Visit <a href="/api/db-status" style={{ color: '#0070f3', textDecoration: 'underline' }}>/api/db-status</a> to check database connection status.</p>
    </main>
  );
}
