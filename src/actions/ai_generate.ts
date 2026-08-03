"use server";

import Replicate from "replicate";
import { put } from "@vercel/blob";
import { redis } from "@/lib/redis";

export async function removeWheelBackground(imageUrl: string): Promise<string | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return null;

  try {
    const cacheKey = `rembg-v2:${imageUrl}`;
    const cached = await redis.get<string>(cacheKey);
    if (cached) {
      console.log("Using cached transparent wheel for:", imageUrl);
      return cached;
    }

    const replicate = new Replicate({ auth: token });
    console.log("Removing background for:", imageUrl);
    
    // 1. Shopify's CDN blocks Python bots (which Replicate uses). 
    // We must fetch it via Next.js and upload it to a clean Vercel Blob URL.
    const res = await fetch(imageUrl);
    const arrayBuffer = await res.arrayBuffer();
    const blob = await put(`wheel-tmp-${Date.now()}.jpg`, Buffer.from(arrayBuffer), {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    
    const output: any = await replicate.run(
      "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      {
        input: {
          image: blob.url
        }
      }
    );
    
    const file = Array.isArray(output) ? output[0] : output;
    let finalUrl: string | null = null;
    
    if (!file) return null;

    // Fetch the Replicate URL immediately to prevent 1-hour expiration and 404s!
    let fileUrl = "";
    if (typeof file === "string") {
      fileUrl = file;
    } else if (typeof file.url === "function") {
      fileUrl = file.url().toString();
    } else if (typeof file.blob === "function") {
      const b = await file.blob();
      const ab = await b.arrayBuffer();
      finalUrl = `data:image/png;base64,${Buffer.from(ab).toString("base64")}`;
    }

    if (fileUrl && !finalUrl) {
      const fetchRes = await fetch(fileUrl, { headers: { "Authorization": `Bearer ${token}` }});
      if (fetchRes.ok) {
        const ab = await fetchRes.arrayBuffer();
        finalUrl = `data:image/png;base64,${Buffer.from(ab).toString("base64")}`;
      } else {
        finalUrl = fileUrl; // fallback
      }
    }

    if (finalUrl) {
      await redis.setex(cacheKey, 60 * 60 * 24 * 30, finalUrl); // cache base64 for 30 days
    }
    
    return finalUrl;
  } catch (error) {
    console.error("Rembg Error:", error);
    return null;
  }
}

export async function generateInpaintedWheels(
  originalImageBase64: string,
  maskImageBase64: string,
  prompt: string,
  width: number = 512,
  height: number = 512
): Promise<string | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error("Missing REPLICATE_API_TOKEN");
    throw new Error("REPLICATE_API_TOKEN is missing");
  }

  try {
    const replicate = new Replicate({
      auth: token,
    });

    console.log(`Calling Replicate Harmonization with prompt: ${prompt} (Size: ${width}x${height})`);

    // We use Flux Fill Schnell for state-of-the-art inpainting harmonization.
    // It is incredibly fast and preserves the pasted pixels much better than SD 1.5.
    const output: any = await replicate.run(
      "black-forest-labs/flux-fill-pro",
      {
        input: {
          image: originalImageBase64,
          mask: maskImageBase64,
          prompt: prompt,
          output_format: "jpg"
        },
      }
    );

    const file = Array.isArray(output) ? output[0] : output;
    
    if (!file) return null;

    // The new Replicate SDK supports file.blob() which handles auth automatically!
    if (file && typeof file.blob === "function") {
      const blob = await file.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return `data:image/jpeg;base64,${Buffer.from(arrayBuffer).toString("base64")}`;
    }

    let fileUrl = "";
    if (typeof file === "string") {
      fileUrl = file;
    } else if (typeof file.url === "function") {
      fileUrl = file.url().toString();
    }

    if (fileUrl) {
      // If we only have a URL, fetch it on the server using our API token in case it's a private URL
      const res = await fetch(fileUrl, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        return `data:image/jpeg;base64,${Buffer.from(arrayBuffer).toString("base64")}`;
      }
      return fileUrl;
    }

    // Fallback for streams
    const chunks = [];
    for await (const chunk of file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
    
  } catch (error) {
    console.error("Replicate API Error:", error);
    throw error;
  }
}

/**
 * Gemini-powered image generation for wheel inpainting.
 * Uses gemini-2.0-flash-preview-image-generation with responseModalities: ["IMAGE"]
 * to edit the composite car image and blend the wheels realistically.
 * No separate mask needed — Gemini understands the scene from the prompt.
 */
export async function generateInpaintedWheelsGemini(
  compositeImageBase64: string, // data:image/jpeg;base64,... (car + pasted wheels)
  maskImageBase64: string,       // data:image/jpeg;base64,... (white circles = wheel zones)
  prompt: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY");
    throw new Error("GEMINI_API_KEY is missing");
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    // Strip the data URI prefix to get raw base64
    const compBase64 = compositeImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const maskBase64 = maskImageBase64.replace(/^data:image\/\w+;base64,/, "");

    console.log("Calling Gemini image generation for wheel inpainting...");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are a professional automotive retouching artist. I have a vehicle photo where replacement wheels have been pasted onto the car. The white circular regions in the mask image show exactly where the wheels are located.

Your task is to seamlessly integrate the replacement wheel into the original vehicle photo so the final result looks like a real photograph of the car with those exact wheels physically installed — not an edited image.

CRITICAL RULES — follow every point exactly:

WHEEL DESIGN: Keep the exact wheel design, spoke pattern, shape, colour, finish, and all surface details from the pasted wheel. Do NOT redesign, simplify, or replace the wheel with a generic one.

SEAMLESS INTEGRATION: Remove every visible sign that the wheel was pasted or overlaid — eliminate white backgrounds, cutout edges, halos, sharp borders, and any compositing artefacts around the wheel.

NATURAL BLENDING:
- Match the original photo's lighting direction, shadow intensity, reflections, and colour tone exactly.
- Add realistic contact shadows where the tyre meets the ground and wheel arch.
- Correct perspective, scale, and angle so the wheel fits the vehicle's geometry naturally.
- Blend the tyre sidewall, rim edge, and surrounding bodywork smoothly with no hard transitions.
- Ensure there is no white or transparent space visible through wheel spokes — fill those gaps with what would realistically appear behind (car body, ground, or background).

PRESERVE: Keep the car body, paint colour, decals, brakes, suspension, background, and overall scene completely unchanged. Only refine the masked wheel zones.

OUTPUT: A single photorealistic image that looks like it was taken by a professional photographer of the car with those wheels installed from the factory.`,
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: compBase64,
              },
            },
            {
              text: "This is the mask showing the wheel zones (white circles = areas to seamlessly integrate):",
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: maskBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
        temperature: 1,
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType ?? "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    console.error("Gemini returned no image parts. Parts:", JSON.stringify(parts.map(p => Object.keys(p))));
    return null;
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    throw error;
  }
}

/**
 * generateGeminiWheelSwap
 * ─────────────────────────────────────────────────────────────────────────────
 * Reference-driven wheel swap for Gemini.
 *
 * Architecture (correct for Gemini):
 *   Image 1  →  original, untouched car photo
 *   Image 2  →  isolated wheel reference (transparent PNG or product image)
 *   Prompt   →  "replace the wheels on image 1 with the design from image 2"
 *
 * This is fundamentally different from the Flux/inpainting flow.  Gemini is
 * excellent at reference-driven edits ("put this object from image B onto
 * image A") but poor at fixing already-composited images ("make this paste job
 * look real").  Sending it a pre-composited image + mask was giving it nothing
 * to work with — it just returned the same image unchanged.
 */
export async function generateGeminiWheelSwap(
  carImageBase64: string,   // data:image/... — original car photo, no wheels pasted
  wheelImageBase64: string, // data:image/... — isolated wheel reference (rembg transparent or product img)
  prompt: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY");
    throw new Error("GEMINI_API_KEY is missing");
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    // Strip data URI prefixes to get raw base64 + detect mime types
    const carMime   = (carImageBase64.match(/^data:(image\/\w+);base64,/)  ?.[1] ?? "image/jpeg") as string;
    const wheelMime = (wheelImageBase64.match(/^data:(image\/\w+);base64,/)?.[1] ?? "image/png")  as string;
    const carBase64   = carImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const wheelBase64 = wheelImageBase64.replace(/^data:image\/\w+;base64,/, "");

    console.log("Calling Gemini wheel swap (car + wheel reference)...");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              // Image 1 — original car
              inlineData: { mimeType: carMime,   data: carBase64 },
            },
            {
              // Image 2 — wheel reference
              inlineData: { mimeType: wheelMime, data: wheelBase64 },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
        temperature: 1,
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType ?? "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    console.error("Gemini wheel swap returned no image parts. Parts:", JSON.stringify(parts.map(p => Object.keys(p))));
    return null;
  } catch (error) {
    console.error("Gemini Wheel Swap Error:", error);
    throw error;
  }
}
