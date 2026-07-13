// Vercel serverless function: same-origin music search proxy.
// iTunes' CORS/JSONP behavior is unreliable from iOS standalone PWAs,
// so the app calls /api/search and this function does the hop.
export default async function handler(req, res) {
  const term = (req.query.term ?? "").toString().trim();
  const limit = Math.min(25, parseInt(req.query.limit ?? "12", 10) || 12);
  if (!term) {
    res.status(400).json({ results: [] });
    return;
  }
  try {
    const r = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}`,
      { headers: { "user-agent": "tether-pwa/1.0" } },
    );
    const json = await r.json();
    res.setHeader("cache-control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(json);
  } catch {
    res.status(502).json({ results: [] });
  }
}
