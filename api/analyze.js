// api/analyze.js
// Vercel Serverless Function (Node.js runtime, zero extra dependencies).
//
// Uses Google's Gemini API (free tier, no credit card required) to analyze
// a typing session and generate a follow-up practice paragraph.
//
//   POST body: { wpm, accuracy, errors, errorMap, paragraph }
//   response:  { feedback: string, nextParagraph: string }

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    return;
  }

  const { wpm = 0, accuracy = 100, errors = 0, errorMap = {}, paragraph = "" } = req.body || {};

  const worstKeys =
    Object.entries(errorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ch, count]) => `"${ch === " " ? "space" : ch}" (${count} misses)`)
      .join(", ") || "none detected";

  const prompt = `You are an encouraging typing coach reviewing one practice session.
Stats: ${wpm} WPM, ${accuracy}% accuracy, ${errors} total errors.
Most-missed characters: ${worstKeys}.
Original passage: "${paragraph}"

Reply with ONLY a JSON object in exactly this shape:
{"feedback": "2-3 short, specific, encouraging sentences that reference the actual weak keys and how to fix them", "nextParagraph": "a new 30-45 word natural-sounding English practice paragraph that reuses the user's weak characters more often than normal, no offensive content"}`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    res.status(200).json({
      feedback: parsed.feedback || "Nice run! Keep practicing consistently.",
      nextParagraph: parsed.nextParagraph || "",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI analysis failed", details: String(err.message || err) });
  }
};
