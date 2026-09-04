// Vercel serverless function. Deployed automatically because it lives under /api.
//
// Fetches the published Google Sheet CSV server-side (Google doesn't send CORS
// headers on the pub/output=csv endpoint, so the browser can't read it directly)
// and passes the raw CSV straight through. Parsing happens client-side in app.js.
//
// Reads the sheet URL from the server-side environment variable NETWORTH_CSV_URL,
// which you set in the Vercel dashboard (Project Settings > Environment Variables).
// Keeping it in an env var (not hardcoded) means the link can be rotated/unpublished
// without a code change or redeploy.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const csvUrl = process.env.NETWORTH_CSV_URL;
  if (!csvUrl) {
    res.status(500).json({ error: 'Server missing NETWORTH_CSV_URL. Add it in Vercel > Project Settings > Environment Variables, then redeploy.' });
    return;
  }

  try {
    const upstream = await fetch(csvUrl);
    if (!upstream.ok) {
      res.status(502).json({ error: 'Failed to fetch sheet', status: upstream.status });
      return;
    }
    const csv = await upstream.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(csv);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch sheet', detail: String(e && e.message || e) });
  }
}
