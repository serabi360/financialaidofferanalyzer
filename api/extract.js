// Vercel serverless function: POST /api/extract
// Body: { files: [{ mimeType: string, base64: string }] }
// Reads GEMINI_API_KEY from environment (set in Vercel dashboard — never in code).

const EXTRACTION_PROMPT = `You are extracting structured data from a college financial aid award letter. You may be given MULTIPLE images/pages/photos that together make up ONE letter (e.g. a document too large for one photo, or a multi-page PDF split into pieces) — treat all provided files as one combined document and extract a single set of values from across all of them.

For every numeric field, also return a short "evidence" string: the actual line, label, or phrase from the letter that the number came from (e.g. "Federal Pell Grant ... $4,200" or "Tuition & Fees row, Fall+Spring columns summed"). This lets a student trace each figure back to where it appeared. Keep evidence short (under ~15 words) and as close to verbatim as possible. If a field is not found, its value is null and its evidence is null — do not invent evidence for a null value.

Do NOT extract, return, or reference any personally identifying information from the letter — no student name, student ID number, address, date of birth, or similar. Only extract the school name and the financial figures listed below.

If a figure is blurry, glare-obscured, cut off, or otherwise not clearly legible, do NOT guess or substitute a nearby number (e.g. a parenthetical sub-fee breakdown next to the real total) as a stand-in. Return null for that field instead — an honest "not found" is much better than a confident wrong number.

ANNUAL FIGURES: All amounts must be annual (full academic year) totals, not per-term. Many letters show costs/aid broken out by term (Fall/Spring) or by semester. If the letter states an explicit annual total for a value, use that (and say so in the evidence). If it only shows per-term figures, sum them across all terms shown (e.g. Fall + Spring) to produce the annual amount, and note that in the evidence (e.g. "Fall $1,750 + Spring $1,750").

DOCUMENT QUALITY: Separately from the individual fields, assess whether the uploaded file(s) have any quality problems that likely caused you to miss information — blur, glare, low resolution, poor lighting, a cropped/cut-off edge, or a page that appears to be missing (e.g. only page 1 of what looks like a multi-page letter). If you notice any of these, describe it briefly and plainly in "documentIssues" (e.g. "The bottom-right of the page is cut off, and part of the loan table may be missing." or "This photo is blurry in the lower half, which may affect the accuracy of the loan and work-study figures."). This is meant to prompt the student to retake the photo or find a clearer copy — write it as a direct, friendly suggestion. If the document is clear and appears complete, set "documentIssues" to null. Do not flag a document as having issues just because some fields are legitimately absent from the letter (e.g. a school that offers no PLUS loan) — only flag actual readability/completeness problems with the file itself.

Fields to extract, each as {"value": number|null, "evidence": string|null}:
- tuition: tuition cost, annual (part of Cost of Attendance)
- housing: housing/room & board cost, annual (part of Cost of Attendance)
- otherCosts: other indirect costs bundled together — books, supplies, transportation, personal expenses, etc. — summed into one annual figure if the letter lists them as separate line items; evidence should list which sub-items were summed
- pellGrant: Federal Pell Grant, annual
- stateAid: any state-funded grant or aid program, annual
- institutionalGrants: grants funded directly by the school itself (not named scholarships — those go under scholarships below), annual
- otherGrants: any other grant that doesn't fit the categories above (e.g. Supplemental Educational Opportunity Grant / SEOG, or any unlisted state/federal/institutional grant), summed, annual; evidence should name what was included
- directSubsidizedLoan: Federal Direct Subsidized Loan, annual
- directUnsubsidizedLoan: Federal Direct Unsubsidized Loan, annual
- directPlusLoan: Direct PLUS Loan (Parent PLUS or Grad PLUS) — this is NOT guaranteed and typically requires a separate credit-based application; still report the amount shown on the letter if present, annual
- otherLoans: any other loan type not covered above (private loans, institutional loans, etc.), summed, annual
- federalWorkStudy: Federal Work-Study award, annual — this is earned through part-time work and is not guaranteed; keep it distinct from grants/loans

Also extract:
- schoolName: the name of the college/university (plain string, no evidence needed)
- scholarships: an array of EVERY named/outside scholarship found on the letter (scholarship names vary widely — anything titled as a scholarship, including ones named after a person, an organization, a company, etc.). Each entry: {"name": string, "amount": number, "evidence": string|null}. If no named scholarships are found, return an empty array. Do not include institutional grants or Pell here — those belong in their own fields above.

Respond with ONLY a JSON object, no other text, no markdown fences:
{"schoolName": string|null, "documentIssues": string|null, "tuition": {"value": number|null, "evidence": string|null}, "housing": {"value": number|null, "evidence": string|null}, "otherCosts": {"value": number|null, "evidence": string|null}, "pellGrant": {"value": number|null, "evidence": string|null}, "stateAid": {"value": number|null, "evidence": string|null}, "institutionalGrants": {"value": number|null, "evidence": string|null}, "otherGrants": {"value": number|null, "evidence": string|null}, "directSubsidizedLoan": {"value": number|null, "evidence": string|null}, "directUnsubsidizedLoan": {"value": number|null, "evidence": string|null}, "directPlusLoan": {"value": number|null, "evidence": string|null}, "otherLoans": {"value": number|null, "evidence": string|null}, "federalWorkStudy": {"value": number|null, "evidence": string|null}, "scholarships": [{"name": string, "amount": number, "evidence": string|null}]}`;

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
