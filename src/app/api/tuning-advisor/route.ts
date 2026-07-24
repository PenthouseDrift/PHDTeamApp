import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { CalibrationSetup } from "@/types";

export const runtime = "nodejs";

interface TuningRequest {
  calibration: CalibrationSetup;
  carName: string;
  goals: string[];
  surface: string;
}

interface TuningChange {
  section: string;
  field: string;
  label: string;
  currentValue: string;
  recommendedValue: string;
  reason: string;
  priority: "high" | "medium" | "low";
  direction: "increase" | "decrease" | "change" | "info";
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

function buildCalibrationSummary(cal: CalibrationSetup): string {
  return `
Calibration Name: ${cal.name}
Car: attached

SUSPENSION & SHOCKS:
- Front Ride Height: ${cal.frontRideHeight ?? 0}mm
- Rear Ride Height: ${cal.rearRideHeight ?? 0}mm
- Front Spring: ${cal.frontSpringRate || "Not set"}
- Rear Spring: ${cal.rearSpringRate || "Not set"}
- Front Oil Weight: ${cal.frontOilWeight || "Not set"}
- Rear Oil Weight: ${cal.rearOilWeight || "Not set"}
- Front Oil Brand: ${cal.frontOilBrand || "Not set"}
- Rear Oil Brand: ${cal.rearOilBrand || "Not set"}
- Front Piston Holes: ${cal.frontPistonHoles ?? 0}
- Rear Piston Holes: ${cal.rearPistonHoles ?? 0}
- Front Piston Hole Size: ${cal.frontPistonHoleSize || "Not set"}
- Rear Piston Hole Size: ${cal.rearPistonHoleSize || "Not set"}
- Front Shock Length: ${cal.frontShockLength ?? 0}mm
- Rear Shock Length: ${cal.rearShockLength ?? 0}mm
- Front Shock Brand: ${cal.frontShockBrand || "Not set"}
- Rear Shock Brand: ${cal.rearShockBrand || "Not set"}
- Front O-Rings: ${cal.frontORings || "Not set"}
- Rear O-Rings: ${cal.rearORings || "Not set"}
- Front Droop: ${cal.frontDroop ?? 0}mm
- Rear Droop: ${cal.rearDroop ?? 0}mm

STEERING & ALIGNMENT:
- Front Camber: ${cal.frontCamber ?? 0}°
- Rear Camber: ${cal.rearCamber ?? 0}°
- Front Toe: ${cal.frontToe ?? 0}°
- Rear Toe: ${cal.rearToe ?? 0}°
- Front Caster: ${cal.frontCaster ?? 0}°
- Ackermann: ${cal.ackermann ?? 0}%
- Steering Angle: ${cal.steeringAngle ?? 0}°

ELECTRONICS & DRIVETRAIN:
- Motor Turns: ${cal.motorTurns ?? 0}T
- Motor Timing: ${cal.motorTiming ?? 0}°
- Motor Placement: ${cal.motorPlacement || "Not set"}
- Gyro Gain: ${cal.gyroGain ?? 0}%
- Throttle Expo: ${cal.throttleExpo ?? 0}%
- Steering Expo: ${cal.steeringExpo ?? 0}%
- Boost: ${cal.boost ?? 0}%
- Turbo: ${cal.turbo ?? 0}%

GEOMETRY & TYRES:
- Front Track Width: ${cal.frontTrackWidth ?? 0}mm
- Rear Track Width: ${cal.rearTrackWidth ?? 0}mm
- Wheelbase: ${cal.wheelbase ?? 0}mm
- Total Weight: ${cal.totalWeight ?? 0}g
- Battery Position: ${cal.batteryPosition || "Not set"}
- Front Tyres: ${cal.frontTyres || "Not set"}
- Rear Tyres: ${cal.rearTyres || "Not set"}
`.trim();
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
  }

  let body: TuningRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { calibration, carName, goals, surface } = body;

  const prompt = `You are an expert RC drift car tuning advisor. Analyse the following calibration setup and provide specific, actionable tuning changes to achieve the user's goals.

Car: ${carName}
Track Surface: ${surface}
${buildCalibrationSummary(calibration)}

TUNING GOALS:
${goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}

SURFACE CONTEXT for "${surface}":
- PHD Track (P-Tile): Penthouse Drift club track — smooth interlocking P-tile plastic, very low grip similar to polished tiles but slightly more consistent; requires soft oil, high droop, elevated gyro gain, careful camber to prevent snap oversteer
- Polished Concrete: Very low grip, smooth — softer oil, higher droop, more gyro gain, aggressive camber
- Carpet: High grip, consistent — stiffer setup, less gyro, more toe, tighter geometry
- Asphalt/Tarmac: Medium grip, outdoor — balanced setup, moderate gyro, watch temperature sensitivity
- Polished Tiles/Marble: Extremely low grip — very soft oil, maximum droop, high gyro, minimal steering expo
- Gym Floor/Hardwood: Low-medium grip, variable — soft-medium oil, medium gyro, flexible setup
- Foam/EVA Tiles: High grip, soft surface — stiffer shock, less droop, lower gyro
- RCP (Racing Combination Products): Very high grip plastic — stiffer oil, minimal droop, low gyro
- Painted Concrete: Low grip, inconsistent — soft oil, higher gyro, careful with camber

Respond ONLY with a valid JSON array (no markdown, no explanation, just the raw JSON) containing tuning change objects. Each object must have these exact fields:
- "section": one of "Suspension & Shocks", "Steering & Alignment", "Electronics & Drivetrain", "Geometry & Tyres"
- "field": the exact parameter name from the calibration (e.g. "frontOilWeight", "gyroGain", "frontCamber")
- "label": human-readable name (e.g. "Front Oil Weight", "Gyro Gain")
- "currentValue": the current value as a string (include units)
- "recommendedValue": your recommended value as a string (include units)
- "reason": 1-2 sentence explanation of WHY this change helps achieve the goals ON THIS SPECIFIC SURFACE
- "priority": "high", "medium", or "low"
- "direction": "increase", "decrease", "change", or "info"

Focus on the most impactful changes (typically 4-10 changes). You can suggest changes for ANY parameters (including parameters currently set to 0, 0mm, 0°, etc., or default/un-modified values) whenever adjusting them will help achieve the user's goals. Consider how the changes interact with each other AND how the surface type affects the optimal values. For RC drift cars specifically, take into account the relationship between oil weight, piston holes, droop, camber, and gyro for drift performance on ${surface}.`;

  // Model cascade: try in order, skip on 503 (overloaded) or 404 (unavailable)
  const MODELS = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite",
  ];

  let response: Response | null = null;
  let lastErrText = "";

  for (const model of MODELS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            topP: 0.9,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (r.ok) {
      response = r;
      break;
    }

    lastErrText = await r.text();
    console.warn(`[Gemini] Model ${model} failed (${r.status}): ${lastErrText.slice(0, 120)}`);

    // Only continue cascade on overload (503) or model-not-found (404)
    if (r.status !== 503 && r.status !== 404) {
      return NextResponse.json({ error: "AI service error", details: lastErrText }, { status: 502 });
    }
  }

  if (!response) {
    return NextResponse.json(
      { error: "All AI models are currently busy. Please try again in a moment.", details: lastErrText },
      { status: 503 }
    );
  }

  const geminiData = (await response.json()) as GeminiResponse;
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Strip markdown code fences if present
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let changes: TuningChange[];
  try {
    changes = JSON.parse(cleaned);
    if (!Array.isArray(changes)) throw new Error("Not an array");
  } catch {
    console.error("[Gemini] Parse error, raw:", rawText);
    return NextResponse.json({ error: "Failed to parse AI response", raw: rawText }, { status: 500 });
  }

  return NextResponse.json({ changes });
}
