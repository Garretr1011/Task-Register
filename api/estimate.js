// Vercel serverless function. Deployed automatically because it lives under /api,
// regardless of the "Other" framework preset used for the rest of this static site.
//
// This is the ONLY place the Anthropic API key is used. It reads it from the
// server-side environment variable ANTHROPIC_API_KEY, which you set in the
// Vercel dashboard (Project Settings > Environment Variables) — never in code,
// never sent to the browser.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { type, text, image } = req.body || {};
  if (!type || (type !== 'food' && type !== 'exercise')) {
    res.status(400).json({ error: 'Expected { type: "food"|"exercise", text?: string, image?: string }' });
    return;
  }
  if (type === 'exercise' && !text) {
    res.status(400).json({ error: 'Exercise entries need a text description' });
    return;
  }
  if (type === 'food' && !text && !image) {
    res.status(400).json({ error: 'Food entries need a description, a photo, or both' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server missing ANTHROPIC_API_KEY. Add it in Vercel > Project Settings > Environment Variables, then redeploy.' });
    return;
  }

  let content;

  if (type === 'food' && image) {
    const match = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(image);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format' });
      return;
    }
    const mediaType = match[1];
    const base64Data = match[2];
    const promptText = `Estimate nutrition facts for the food shown in this photo.${text ? ` Additional context from the user: "${text}"` : ''}\n\nRespond with ONLY a JSON object, no markdown formatting, no explanation, in this exact shape:\n{"description":"...", "calories":123, "protein":12, "carbs":34, "fat":5}\n\nNumbers are grams for protein/carbs/fat, calories as a whole number. Give your best realistic single estimate for what's shown in the photo.`;
    content = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
      { type: 'text', text: promptText }
    ];
  } else if (type === 'food') {
    content = `Estimate nutrition facts for this food description: "${text}"\n\nRespond with ONLY a JSON object, no markdown formatting, no explanation, in this exact shape:\n{"description":"...", "calories":123, "protein":12, "carbs":34, "fat":5}\n\nNumbers are grams for protein/carbs/fat, calories as a whole number. Give your best realistic single estimate for a typical serving as described.`;
  } else {
    content = `Estimate calories burned for this exercise description: "${text}"\n\nRespond with ONLY a JSON object, no markdown formatting, no explanation, in this exact shape:\n{"description":"...", "caloriesBurned":250, "durationMinutes":30}\n\nIf duration isn't mentioned, make a reasonable estimate based on the activity described.`;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content }]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.status(502).json({ error: 'Anthropic API error', detail: errText });
      return;
    }

    const data = await upstream.json();
    const raw = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: 'Failed to estimate', detail: String(e && e.message || e) });
  }
}
