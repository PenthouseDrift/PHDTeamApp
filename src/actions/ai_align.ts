"use server";

import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";

export interface WheelBox {
  position: "front" | "rear";
  ymin: number; // Percentage 0-100
  xmin: number; // Percentage 0-100
  ymax: number; // Percentage 0-100
  xmax: number; // Percentage 0-100
}

export async function generateWheelPrompt(title: string, imageUrl: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return title; // Fallback to just the title

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Fetch the image from Shopify CDN
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString("base64");

    const result = await model.generateContent([
      `You are an expert at writing prompts for Stable Diffusion. Describe the physical appearance of this RC car wheel in 15 words or less. Focus ONLY on its visual design, spoke count, colors (e.g., black lip, silver spokes, deep dish, 5-spoke). Ignore packaging.`,
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg"
        }
      }
    ]);
    
    const description = result.response.text().trim();
    return `${title}, ${description}`;
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    return title;
  }
}

export async function detectWheels(base64DataUrl: string): Promise<WheelBox[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY");
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const responseSchema: Schema = {
      type: SchemaType.ARRAY,
      description: "List of exactly two wheels detected in the image (front and rear)",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          position: {
            type: SchemaType.STRING,
            description: "Either 'front' or 'rear' wheel of the vehicle",
          },
          ymin: {
            type: SchemaType.NUMBER,
            description: "The top edge of the wheel bounding box, as a percentage of image height (0-100)",
          },
          xmin: {
            type: SchemaType.NUMBER,
            description: "The left edge of the wheel bounding box, as a percentage of image width (0-100)",
          },
          ymax: {
            type: SchemaType.NUMBER,
            description: "The bottom edge of the wheel bounding box, as a percentage of image height (0-100)",
          },
          xmax: {
            type: SchemaType.NUMBER,
            description: "The right edge of the wheel bounding box, as a percentage of image width (0-100)",
          },
        },
        required: ["position", "ymin", "xmin", "ymax", "xmax"],
      },
    };

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    // Strip the "data:image/jpeg;base64," part
    const base64Data = base64DataUrl.split(",")[1];
    const mimeType = base64DataUrl.substring(5, base64DataUrl.indexOf(";"));

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType
      },
    };

    const prompt = `Analyze this image of a remote control car (or real car). 
Find the front and rear wheels.
Return their bounding boxes as a percentage (0 to 100) of the total image width and height.
Make sure the bounding boxes tightly fit the actual wheel rim and tire.`;

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    
    const parsed = JSON.parse(responseText) as WheelBox[];
    return parsed;

  } catch (error) {
    console.error("Error in detectWheels:", error);
    return null;
  }
}
