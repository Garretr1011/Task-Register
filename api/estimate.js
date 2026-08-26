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

  const { type, text, image, question, totals, remaining } = req.body || {};
  if (!type || (type !== 'food' && type !== 'exercise' && type !== 'suggest')) {
    res.status(400).json({ error: 'Expected { type: "food"|"exercise"|"suggest", ... }' });
    return;
  }
  if (type === 'exercise' && !text && !image) {
    res.status(400).json({ error: 'Exercise entries need a description, a photo, or both' });
    return;
  }
  if (type === 'food' && !text && !image) {
    res.status(400).json({ error: 'Food entries need a description, a photo, or both' });
    return;
  }
  if (type === 'suggest' && (!totals || !remaining)) {
    res.status(400).json({ error: 'Suggestions need today\'s totals and remaining targets' });
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
  } else if (type === 'exercise' && image) {
    const match = /^data:(image\/[a-zA-Z]+);base64,(.+)$/.exec(image);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format' });
      return;
    }
    const mediaType = match[1];
    const base64Data = match[2];
    const promptText = `Read the workout data shown in this screenshot (e.g. from a fitness app, smartwatch, or Garmin).${text ? ` Additional context from the user: "${text}"` : ''}\n\nRespond with ONLY a JSON object, no markdown formatting, no explanation, in this exact shape:\n{"description":"...", "caloriesBurned":250, "durationMinutes":30}\n\nRead the calories burned and duration directly from the screenshot if visible; if a figure isn't clearly shown, make a reasonable estimate from what is visible (activity type, distance, heart rate, pace, etc).`;
    content = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
      { type: 'text', text: promptText }
    ];
  } else if (type === 'exercise') {
    content = `Estimate calories burned for this exercise description: "${text}"\n\nRespond with ONLY a JSON object, no markdown formatting, no explanation, in this exact shape:\n{"description":"...", "caloriesBurned":250, "durationMinutes":30}\n\nIf duration isn't mentioned, make a reasonable estimate based on the activity described.`;
  } else {
    // suggest
    content = `You are a nutrition assistant helping someone finish their day within their targets.

Today so far: ${totals.eaten} calories eaten, ${totals.burned} calories burned, net ${totals.net} calories (target ${totals.calorieTarget}).
Protein: ${totals.protein}g of ${totals.proteinTarget}g target.
Carbs: ${totals.carbs}g of ${totals.carbsTarget}g target.
Fat: ${totals.fat}g of ${totals.fatTarget}g target.

Remaining today: ${remaining.calories} calories, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat.

${question ? `The user specifically asks: "${question}"` : 'Suggest 2-4 practical food or snack options that would help them hit their remaining targets for today.'}

Keep it brief and practical: a short list of specific food or snack suggestions with rough calorie and macro estimates for each. Plain text only, use simple dashes for list items, no markdown headers or bold.`;
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
        max_tokens: type === 'suggest' ? 400 : 300,
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

    if (type === 'suggest') {
      res.status(200).json({ suggestion: raw });
      return;
    }

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: 'Failed to estimate', detail: String(e && e.message || e) });
  }
}
