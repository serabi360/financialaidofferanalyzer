// Vercel serverless function: POST /api/extract
// Body: { files: [{ mimeType: string, base64: string }] }
// Reads GEMINI_API_KEY from environment (set in Vercel dashboard — never in code).

const EXTRACTION_PROMPT = `You are extracting structured data from a college financial aid award letter. You may be given MULTIPLE images/pages/photos that together make up ONE letter (e.g. a document too large for one photo, or a multi-page PDF split into pieces) — treat all provided files as one combined document and extract a single set of values from across all of them.

Find these specific data points if present anywhere across the provided files. Amounts are typically annual figures. If a field is not present anywhere in the document, use null — do not guess or estimate.

Do NOT extract, return, or reference any personally identifying information from the letter — no student name, student ID number, address, date of birth, or similar. Only extract the school name and the financial figures listed below.

If a figure is blurry, glare-obscured, cut off, or otherwise not clearly legible, do NOT guess or substitute a nearby number (e.g. a parenthetical sub-fee breakdown next to the real total) as a stand-in. Return null for that field instead — an honest "not found" is much better than a confident wrong number.

- schoolName: the name of the college/university
- tuition: tuition cost (part of Cost of Attendance)
- housing: housing/room & board cost (part of Cost of Attendance)
- stateAid: any state-funded grant or aid program
- institutionalGrants: grants or scholarships funded by the school itself
- pellGrant: federal Pell Grant amount
- directSubsidizedLoan: Direct Subsidized Loan amount
- directUnsubsidizedLoan: Direct Unsubsidized Loan amount
- federalWorkStudy: Federal Work-Study award amount

Respond with ONLY a JSON object, no other text, no markdown fences:
{"schoolName": string|null, "tuition": number|null, "housing": number|null, "stateAid": number|null, "institutionalGrants": number|null, "pellGrant": number|null, "directSubsidizedLoan": number|null, "directUnsubsidizedLoan": number|null, "federalWorkStudy": number|null}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is not configured with GEMINI_API_KEY." });
  }

  const { files } = req.body || {};
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "No files provided." });
  }

  const parts = files.map((f) => ({
    inline_data: { mime_type: f.mimeType, data: f.base64 },
  }));
  parts.push({ text: EXTRACTION_PROMPT });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(geminiRes.status).json({ error: `Gemini API error: ${errText}` });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ error: "No text returned from Gemini." });
    }

    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
}
