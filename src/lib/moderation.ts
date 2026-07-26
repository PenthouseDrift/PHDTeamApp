import { redis } from "./redis";

export interface ModerationResult {
  safe: boolean;
  reason?: string;
  category?: string;
}

export interface FlaggedIncident {
  flaggedId: string;
  userId: string;
  userName: string;
  userEmail: string;
  imageUrl: string;
  context: string; // e.g. "Car Profile Photo", "Shell Showcase Submission", "Profile Avatar", "Feedback Attachment"
  reason: string;
  createdAt: number;
}

export async function moderateImage(
  imageUrl: string,
  context: string,
  user: { id: string; name?: string | null; email?: string | null }
): Promise<ModerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Fail-open or fallback if API key is not configured in environment
    console.warn("[Moderation] GEMINI_API_KEY not found; skipping image safety check");
    return { safe: true };
  }

  const prompt = `You are an automated content moderation safety system for an all-ages RC drift car club application.
Analyse the image provided at the URL below and determine if it is appropriate for a public, family-friendly app.

Image URL: ${imageUrl}
Upload Context: ${context}

CHECK FOR:
1. Explicit NSFW / Nudity / Sexual Content
2. Extreme Violence / Gore / Blood
3. Hate Symbols / Offensive Text / Hate Speech
4. Harassment / Inappropriate Graphic Imagery

Respond ONLY with a raw JSON object (no markdown, no code block) matching this exact format:
{
  "safe": boolean,
  "reason": "Short 1-sentence explanation if unsafe, or empty string if safe",
  "category": "nsfw" | "violence" | "hate" | "inappropriate" | "safe"
}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  fileData: {
                    fileUri: imageUrl,
                    mimeType: "image/jpeg",
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
          },
        }),
      }
    );

    let data;
    if (r.ok) {
      data = await r.json();
    } else {
      // If fileUri part fails (e.g. external URL), fall back to prompt text with image URL
      const rFallback = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: `${prompt}\n\nPlease inspect the image content accessible at: ${imageUrl}` }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 256,
            },
          }),
        }
      );
      if (!rFallback.ok) {
        console.warn("[Moderation] Gemini API call failed; allowing upload");
        return { safe: true };
      }
      data = await rFallback.json();
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    const parsed = JSON.parse(cleaned);
    const safe = Boolean(parsed.safe);

    if (!safe) {
      const reason = parsed.reason || "Image flagged as inappropriate content.";
      // Log flagged incident to Redis
      const flaggedId = `flag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const incident: FlaggedIncident = {
        flaggedId,
        userId: user.id,
        userName: user.name || "Unknown Member",
        userEmail: user.email || "No Email",
        imageUrl,
        context,
        reason,
        createdAt: Date.now(),
      };

      await redis.hset(`feedback:flagged:${flaggedId}`, incident as unknown as Record<string, unknown>);
      await redis.lpush(`feedback:flagged_list`, flaggedId);

      return { safe: false, reason, category: parsed.category };
    }

    return { safe: true };
  } catch (err) {
    console.error("[Moderation] Exception during image moderation check:", err);
    // Allow upload if moderation service encounters temporary network issue
    return { safe: true };
  }
}
