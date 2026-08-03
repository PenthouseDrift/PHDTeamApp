"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { WheelProduct } from "@/actions/wheels";
import { generateGeminiWheelSwap } from "@/actions/ai_generate";



type Step = "upload" | "front_wheel" | "rear_wheel" | "adjust_size" | "visualize" | "crop_wheel" | "ai_generating" | "ai_result";

interface Box {
  x: number;
  y: number;
  size: number;
  skewX: number;
  skewY: number;
  scaleX?: number;
  scaleY?: number;
}

export function WheelVisualizer({ wheels }: { wheels: WheelProduct[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const [frontWheel, setFrontWheel] = useState<Box | null>(null);
  const [rearWheel, setRearWheel] = useState<Box | null>(null);

  const [activeWheelAdjust, setActiveWheelAdjust] = useState<"front" | "rear">("front");
  const [draggingWheel, setDraggingWheel] = useState<"front" | "rear" | null>(null);

  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; box: Box; rect: DOMRect } | null>(null);

  const [selectedWheelIdx, setSelectedWheelIdx] = useState<number>(0);
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});

  const [isPending, startTransition] = useTransition();

  const imageRef = useRef<HTMLImageElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  // Ref to the currently selected wheel button so we can scroll it into view
  const selectedWheelRef = useRef<HTMLButtonElement>(null);

  // Scroll the active wheel back into the centre of the carousel when the AI result arrives
  useEffect(() => {
    if (step === "ai_result" && selectedWheelRef.current) {
      selectedWheelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [step]);

  // Cropped wheel state - uses a circular selection (center + radius, all in % of image)
  const [croppedWheelDataUrl, setCroppedWheelDataUrl] = useState<string | null>(null);
  const [cropCircle, setCropCircle] = useState<{ cxPx: number; cyPx: number; rPx: number } | null>(null);
  const [isCropDragging, setIsCropDragging] = useState(false);
  const cropDragStart = useRef<{ x: number; y: number } | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);


  const handleSelectWheel = (idx: number) => {
    setSelectedWheelIdx(idx);
    setCroppedWheelDataUrl(null);
    setCropCircle(null);
    if ((step === "visualize" || step === "ai_result") && generatedImages[idx]) {
      setStep("ai_result");
    } else if (step === "ai_result") {
      setStep("visualize");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
      setStep("front_wheel");
    };
    reader.readAsDataURL(file);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (step === "front_wheel") {
      setFrontWheel({ x, y, size: 15, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 });
      setStep("rear_wheel");
    } else if (step === "rear_wheel") {
      setRearWheel({ x, y, size: 15, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1 });
      setStep("adjust_size");
      setActiveWheelAdjust("front");
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingWheel || !imageRef.current) return;

    if (dragHandle && dragStartRef.current) {
      // Handle resizing/skewing
      const start = dragStartRef.current;
      const dx = ((e.clientX - start.x) / start.rect.width) * 100;
      const dy = ((e.clientY - start.y) / start.rect.height) * 100;

      let newBox = { ...start.box };

      if (dragHandle === "se") {
        newBox.scaleX = Math.max(0.1, (start.box.scaleX || 1) + (dx * 2) / start.box.size);
        newBox.scaleY = Math.max(0.1, (start.box.scaleY || 1) + (dy * 2) / start.box.size);
      } else if (dragHandle === "nw") {
        newBox.scaleX = Math.max(0.1, (start.box.scaleX || 1) - (dx * 2) / start.box.size);
        newBox.scaleY = Math.max(0.1, (start.box.scaleY || 1) - (dy * 2) / start.box.size);
      } else if (dragHandle === "ne") {
        newBox.scaleX = Math.max(0.1, (start.box.scaleX || 1) + (dx * 2) / start.box.size);
        newBox.scaleY = Math.max(0.1, (start.box.scaleY || 1) - (dy * 2) / start.box.size);
      } else if (dragHandle === "sw") {
        newBox.scaleX = Math.max(0.1, (start.box.scaleX || 1) - (dx * 2) / start.box.size);
        newBox.scaleY = Math.max(0.1, (start.box.scaleY || 1) + (dy * 2) / start.box.size);
      } else if (dragHandle === "n") {
        newBox.skewX = Math.max(-45, Math.min(45, start.box.skewX - dx * 2));
      } else if (dragHandle === "s") {
        newBox.skewX = Math.max(-45, Math.min(45, start.box.skewX + dx * 2));
      } else if (dragHandle === "w") {
        newBox.skewY = Math.max(-45, Math.min(45, start.box.skewY - dy * 2));
      } else if (dragHandle === "e") {
        newBox.skewY = Math.max(-45, Math.min(45, start.box.skewY + dy * 2));
      }

      if (draggingWheel === "front") setFrontWheel(newBox);
      else if (draggingWheel === "rear") setRearWheel(newBox);

    } else {
      // Standard positioning
      const rect = imageRef.current.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));

      if (draggingWheel === "front" && frontWheel) {
        setFrontWheel({ ...frontWheel, x, y });
      } else if (draggingWheel === "rear" && rearWheel) {
        setRearWheel({ ...rearWheel, x, y });
      }
    }
  };

  const handlePointerUp = () => {
    setDraggingWheel(null);
    setDragHandle(null);
    dragStartRef.current = null;
  };

  const handleUpdateActiveWheel = (updates: Partial<Box>) => {
    if (activeWheelAdjust === "front" && frontWheel) {
      setFrontWheel({ ...frontWheel, ...updates });
    } else if (activeWheelAdjust === "rear" && rearWheel) {
      setRearWheel({ ...rearWheel, ...updates });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────Crop handlers (circular selection) 

  const handleCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cxPx = e.clientX - rect.left;
    const cyPx = e.clientY - rect.top;
    cropDragStart.current = { x: cxPx, y: cyPx };
    setCropCircle({ cxPx, cyPx, rPx: 0 });
    setIsCropDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isCropDragging || !cropDragStart.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - cropDragStart.current.x;
    const dy = y - cropDragStart.current.y;
    const rPx = Math.sqrt(dx * dx + dy * dy);
    setCropCircle({ cxPx: cropDragStart.current.x, cyPx: cropDragStart.current.y, rPx });
  };

  const handleCropPointerUp = () => setIsCropDragging(false);

  const confirmCrop = () => {
    if (!cropCircle || !cropImgRef.current || !cropContainerRef.current || cropCircle.rPx < 8) {
      setStep("visualize");
      return;
    }
    const img = cropImgRef.current;
    const container = cropContainerRef.current;
    const cW = container.offsetWidth;
    const cH = container.offsetHeight;

    // Compute where the image is actually rendered inside the object-contain container
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = cW / cH;
    let imgW: number, imgH: number, imgX: number, imgY: number;
    if (imgAspect > containerAspect) {
      imgW = cW; imgH = cW / imgAspect;
      imgX = 0; imgY = (cH - imgH) / 2;
    } else {
      imgH = cH; imgW = cH * imgAspect;
      imgX = (cW - imgW) / 2; imgY = 0;
    }

    // Scale from container pixels to natural image pixels
    const scale = img.naturalWidth / imgW;
    const srcCx = (cropCircle.cxPx - imgX) * scale;
    const srcCy = (cropCircle.cyPx - imgY) * scale;
    const srcR = cropCircle.rPx * scale;
    const diameter = Math.round(srcR * 2);

    const canvas = document.createElement("canvas");
    canvas.width = diameter;
    canvas.height = diameter;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(diameter / 2, diameter / 2, diameter / 2, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(img, srcCx - srcR, srcCy - srcR, diameter, diameter, 0, 0, diameter, diameter);
    const dataUrl = canvas.toDataURL("image/png");
    setCroppedWheelDataUrl(dataUrl);
    setStep("visualize");
  };

  const skipCrop = () => {
    setCroppedWheelDataUrl(null);
    setStep("visualize");
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ─── Resize helper ──────────────────────────────────────────────────────
  // AI models don't benefit from >1280px — this keeps payloads well under 1 MB.
  const MAX_AI_PX = 1280;
  const resizeDataUrl = (src: string, maxPx = MAX_AI_PX, quality = 0.88): Promise<string> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      // Must be set BEFORE src — prevents canvas taint for cross-origin URLs (e.g. Shopify CDN).
      // Safe to always set; ignored for data: URLs.
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(image.width, image.height));
        const w = Math.round(image.width  * scale);
        const h = Math.round(image.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(image, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      image.onerror = () => reject(new Error(`Failed to load image for resize: ${src.slice(0, 80)}`));
      image.src = src;
    });
  // ────────────────────────────────────────────────────────────────────────

  const generateAiPhoto = async () => {
    if (!imageSrc || !frontWheel || !rearWheel) return;

    setStep("ai_generating");

    const selectedWheel = wheels[selectedWheelIdx];

    // Gemini reference-driven wheel swap:
    //   Image 1 = original car photo (no overlays)
    //   Image 2 = wheel reference (cropped by user, or raw product image)
    startTransition(async () => {
      try {
        const geminiPrompt = `Image 1 is the original RC drift car photo.
Image 2 is the exact replacement wheel design.

Replace the existing wheels on the car with the wheel from Image 2.

The replacement wheels must:
- keep the exact spoke design
- keep the exact colour
- keep the exact rim shape
- keep the same finish

Do not redesign the wheel.

Match:
- camera perspective
- wheel angle
- lighting
- reflections
- shadows
- tyre position
- wheel arch depth

Make the result look like a real photograph taken with these wheels installed.

Only change the wheels.
Do not alter the car body, decals, background, or environment.`;

        // Resize both images to ≤1280px before sending to stay well under limits
        const [carResized, wheelResized] = await Promise.all([
          resizeDataUrl(imageSrc!),
          resizeDataUrl(croppedWheelDataUrl || selectedWheel.imageUrl),
        ]);
        console.log(
          `[GEMINI PAYLOAD] car: ~${Math.round(carResized.length / 1024)}KB  wheel: ~${Math.round(wheelResized.length / 1024)}KB`
        );

        const resultUrl = await generateGeminiWheelSwap(carResized, wheelResized, geminiPrompt);

        if (resultUrl) {
          setGeneratedImages(prev => ({ ...prev, [selectedWheelIdx]: resultUrl }));
          setStep("ai_result");
        } else {
          alert("Failed to generate image.");
          setStep("visualize");
        }
      } catch (err) {
        console.error(err);
        alert("Error generating image. Check your GEMINI_API_KEY.");
        setStep("visualize");
      }
    });
  };

  const selectedWheel = wheels[selectedWheelIdx];

  const onHandlePointerDown = (e: React.PointerEvent, handle: string, type: "front" | "rear", box: Box) => {
    e.stopPropagation();
    if (!imageRef.current) return;
    setDragHandle(handle);
    setDraggingWheel(type);
    setActiveWheelAdjust(type);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      box: { ...box },
      rect: imageRef.current.getBoundingClientRect()
    };
  };

  const renderWheelOverlay = (box: Box | null, type: "front" | "rear") => {
    if (!box) return null;

    const isActive = step === "adjust_size" && activeWheelAdjust === type;

    return (
      <div
        onPointerDown={(e) => {
          if (step === "adjust_size" || step === "visualize") {
            e.stopPropagation();
            setDraggingWheel(type);
            setActiveWheelAdjust(type);
          }
        }}
        className={`absolute shadow-2xl transition-all z-10 ${step === "adjust_size" || step === "visualize" ? "cursor-grab active:cursor-grabbing touch-none" : "pointer-events-none"
          }`}
        style={{
          left: `${box.x}%`,
          top: `${box.y}%`,
          width: `${box.size}%`,
          aspectRatio: "1 / 1",
          transform: `translate(-50%, -50%) skewX(${box.skewX}deg) skewY(${box.skewY}deg) scaleX(${box.scaleX || 1}) scaleY(${box.scaleY || 1})`,
          opacity: draggingWheel && draggingWheel !== type ? 0.5 : 1
        }}
      >
        {/* The Wheel Image container with bright circular guide */}
        <div className={`absolute inset-0 rounded-full overflow-hidden pointer-events-none ${step !== "visualize" ? "border-[3px] border-white shadow-[0_0_15px_rgba(0,0,0,0.8)]" : ""}`}>
          {step === "visualize" && (
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={croppedWheelDataUrl || wheels[selectedWheelIdx]?.imageUrl}
                alt="Wheel Overlay"
                className="w-full h-full object-contain drop-shadow-2xl pointer-events-none"
              />
            </div>
          )}
          {step !== "visualize" && (
            <div className="w-full h-full flex items-center justify-center pointer-events-none">
              <div className="w-2 h-2 bg-white rounded-full shadow-lg"></div>
            </div>
          )}
        </div>

        {/* Expanded Bounding Box & Transform Handles */}
        {isActive && (
          <div className="absolute -inset-4 border-2 border-dashed border-amber-500/60 bg-amber-500/5 pointer-events-none">
            {/* Corners (Scale) */}
            <div onPointerDown={(e) => onHandlePointerDown(e, "nw", type, box)} className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-white border-[3px] border-amber-500 rounded-full cursor-nwse-resize pointer-events-auto shadow-sm" />
            <div onPointerDown={(e) => onHandlePointerDown(e, "ne", type, box)} className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-white border-[3px] border-amber-500 rounded-full cursor-nesw-resize pointer-events-auto shadow-sm" />
            <div onPointerDown={(e) => onHandlePointerDown(e, "sw", type, box)} className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-5 h-5 bg-white border-[3px] border-amber-500 rounded-full cursor-nesw-resize pointer-events-auto shadow-sm" />
            <div onPointerDown={(e) => onHandlePointerDown(e, "se", type, box)} className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-5 h-5 bg-white border-[3px] border-amber-500 rounded-full cursor-nwse-resize pointer-events-auto shadow-sm" />

            {/* Edges (Skew) */}
            <div onPointerDown={(e) => onHandlePointerDown(e, "n", type, box)} className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-amber-500 rounded-md cursor-ew-resize pointer-events-auto shadow-sm" />
            <div onPointerDown={(e) => onHandlePointerDown(e, "s", type, box)} className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-5 h-5 bg-amber-500 rounded-md cursor-ew-resize pointer-events-auto shadow-sm" />
            <div onPointerDown={(e) => onHandlePointerDown(e, "w", type, box)} className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-amber-500 rounded-md cursor-ns-resize pointer-events-auto shadow-sm" />
            <div onPointerDown={(e) => onHandlePointerDown(e, "e", type, box)} className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-amber-500 rounded-md cursor-ns-resize pointer-events-auto shadow-sm" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-6 max-w-5xl mx-auto w-full">



      {/* Header Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-6 text-center shadow-sm">
        <h1 className="text-xl md:text-2xl font-black text-white mb-2">RC Wheel Visualizer</h1>
        <p className="text-sm text-zinc-400 font-medium">
          {step === "upload" && "Upload a photo of your RC car to try on wheels."}
          {step === "front_wheel" && "Tap the exact center of your FRONT wheel."}
          {step === "rear_wheel" && "Tap the exact center of your REAR wheel."}
          {step === "adjust_size" && "Use the slider to match the wheel size exactly."}
          {step === "crop_wheel" && "Drag to select just the single wheel face from the product image."}
          {step === "visualize" && "Select a wheel below, then generate your AI photo."}
          {step === "ai_generating" && "✦ Gemini is generating your wheel swap..."}
          {step === "ai_result" && "Here is your AI-generated photo with the new wheels!"}
        </p>
      </div>

      {/* Main Canvas Area */}
      <div className="relative flex-1 min-h-[350px] md:min-h-[450px] bg-zinc-950 rounded-2xl border border-zinc-800 flex items-center justify-center overflow-hidden shadow-inner">

        {step === "upload" && (
          <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-zinc-900/50 transition-colors p-6 text-center">
            <div className="w-24 h-24 mb-6 bg-zinc-800 rounded-full flex items-center justify-center text-4xl shadow-md border border-zinc-700/50">📸</div>
            <span className="text-amber-500 font-bold text-lg mb-2">Tap to Upload Photo</span>
            <span className="text-sm text-zinc-500 max-w-xs">Upload a side-profile shot of your car.</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
        )}

        {step === "ai_result" && generatedImages[selectedWheelIdx] && (
          <div className="relative w-full h-full flex flex-col p-4 z-40 bg-zinc-950 absolute inset-0">
            <img src={generatedImages[selectedWheelIdx]} alt="AI Result" className="w-full h-auto object-contain max-h-[60vh] rounded-xl shadow-2xl border border-zinc-700" />
          </div>
        )}

        {step === "crop_wheel" && (
          <div className="absolute inset-0 z-20 bg-zinc-950 flex flex-col p-4 gap-3">
            <div className="text-center">
              <p className="text-sm text-amber-400 font-bold">Click the wheel centre, then drag to set the size</p>
              <p className="text-xs text-zinc-500 mt-0.5">Draw a circle around just one wheel face</p>
            </div>
            <div
              ref={cropContainerRef}
              className="relative select-none cursor-crosshair flex-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900"
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
            >
              <img
                ref={cropImgRef}
                src={wheels[selectedWheelIdx]?.imageUrl ?? ""}
                alt="Crop wheel"
                crossOrigin="anonymous"
                className="w-full h-full object-contain block"
                draggable={false}
              />
              {cropCircle && cropCircle.rPx > 0 && (
                <div
                  className="absolute pointer-events-none border-[3px] border-amber-400 rounded-full shadow-[0_0_20px_rgba(251,191,36,0.6)] bg-amber-400/10"
                  style={{
                    left: `${cropCircle.cxPx - cropCircle.rPx}px`,
                    top: `${cropCircle.cyPx - cropCircle.rPx}px`,
                    width: `${cropCircle.rPx * 2}px`,
                    height: `${cropCircle.rPx * 2}px`,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    aspectRatio: '1 / 1',
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 bg-amber-400 rounded-full shadow-lg" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={confirmCrop}
                disabled={!cropCircle || cropCircle.rPx < 8}
                className="w-full py-3.5 px-5 rounded-xl font-black text-sm text-black bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg"
              >
                ...✅ Crop &amp; Return to Car
              </button>
              <button onClick={skipCrop} className="w-full py-2.5 px-5 rounded-xl font-bold text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors">
                Skip - use full image
              </button>
            </div>
          </div>
        )}

        {step !== "upload" && (
          <div className="relative w-full h-full flex flex-col" style={{ visibility: step === "ai_result" ? "hidden" : "visible", position: step === "ai_result" ? "absolute" : "relative" }}>
            {step === "ai_generating" && (
              <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
                <span className="text-white font-bold animate-pulse">✦ Gemini is swapping the wheels...</span>
                <span className="text-xs text-zinc-400 mt-2 text-center max-w-xs">Using Gemini 2.5 Flash image generation.</span>
              </div>
            )}

            <div
              className="relative w-full max-w-4xl mx-auto flex-1 flex items-center justify-center mt-2"
              style={{ cursor: step === "visualize" || step === "adjust_size" || step === "ai_generating" ? "default" : "crosshair" }}
              onClick={handleImageClick}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <img
                ref={imageRef}
                src={imageSrc ?? ""}
                alt="Car Profile"
                className="w-full h-auto object-contain max-h-[60vh] rounded-xl select-none pointer-events-none"
                draggable="false"
              />

              {renderWheelOverlay(frontWheel, "front")}
              {renderWheelOverlay(rearWheel, "rear")}
            </div>
          </div>
        )}
      </div>


      {/* Controls Area */}
      {step === "adjust_size" && (
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-6 shadow-sm">
          <div className="flex bg-zinc-800/50 p-1 rounded-xl">
            <button
              onClick={() => setActiveWheelAdjust("front")}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeWheelAdjust === "front" ? "bg-amber-500 text-black shadow-md" : "text-zinc-400 hover:text-white"}`}
            >
              Front Wheel
            </button>
            <button
              onClick={() => setActiveWheelAdjust("rear")}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${activeWheelAdjust === "rear" ? "bg-amber-500 text-black shadow-md" : "text-zinc-400 hover:text-white"}`}
            >
              Rear Wheel
            </button>
          </div>

          <div className="bg-zinc-800/30 border border-amber-500/20 p-4 rounded-xl space-y-3">
            <p className="text-sm font-bold text-amber-500 text-center">Transform Tips:</p>
            <ul className="text-xs text-zinc-400 space-y-2 list-disc list-inside">
              <li>Drag the <span className="text-white">center</span> of the wheel to move it</li>
              <li>Drag the <span className="text-white">white corner circles</span> to stretch width/height independently</li>
              <li>Drag the <span className="text-white">orange edge squares</span> to skew the perspective</li>
            </ul>
          </div>

          <div className="flex gap-4 pt-2">
            <button
              onClick={() => { setStep("front_wheel"); setFrontWheel(null); setRearWheel(null); }}
              className="flex-1 py-3 px-4 rounded-xl font-bold text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors shadow-sm"
            >
              Reset Points
            </button>
            <button
              onClick={() => setStep("visualize")}
              className="flex-1 py-3 px-4 rounded-xl font-black text-black bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 transition-colors shadow-md"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {(step === "visualize" || step === "ai_result") && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 overflow-hidden space-y-5 shadow-sm">
          <div className="flex justify-between items-start px-1 gap-4">
            <div>
              <h3 className="font-bold text-white text-base leading-tight">
                {selectedWheel?.title || "Select a Wheel"}
              </h3>
              <p className="text-xs text-zinc-500 mt-1">From AsboRC Store</p>
            </div>
            <span className="font-black text-green-400 text-lg shrink-0">£{selectedWheel?.price}</span>
          </div>

          <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 px-1 scrollbar-hide -mx-1" style={{ WebkitOverflowScrolling: "touch" }}>
            {wheels.map((wheel, idx) => (
              <button
                key={wheel.id}
                ref={selectedWheelIdx === idx ? selectedWheelRef : null}
                onClick={() => handleSelectWheel(idx)}
                className={`relative snap-center shrink-0 w-24 h-24 md:w-28 md:h-28 rounded-2xl overflow-hidden border-2 transition-all bg-white ${selectedWheelIdx === idx ? "border-amber-500 ring-4 ring-amber-500/20 shadow-lg scale-105" : "border-zinc-800 opacity-50 hover:opacity-100"
                  }`}
              >
                <img src={wheel.imageUrl} alt="" className="w-full h-full object-cover p-1 rounded-2xl" />
                {generatedImages[idx] && (
                  <div className="absolute top-1 right-1 bg-green-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
                    AI
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="pt-2 space-y-3">
            {step === "visualize" ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setStep("crop_wheel")}
                  className="px-4 py-4 rounded-xl font-bold text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-all shadow-sm shrink-0 flex items-center gap-1"
                >
                  ✂ Crop
                </button>
                <button
                  onClick={generateAiPhoto}
                  disabled={isPending}
                  className="flex-1 py-4 px-4 rounded-xl font-black text-white bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  ✦ Generate with Gemini
                </button>
              </div>
            ) : (
              <button
                onClick={generateAiPhoto}
                disabled={isPending}
                className="w-full py-4 px-4 rounded-xl font-black text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                🔄 Regenerate with Gemini
              </button>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("upload")}
                className="px-4 py-3 text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors shadow-sm shrink-0"
              >
                New Photo
              </button>
              {step === "ai_result" ? (
                <button
                  onClick={() => setStep("visualize")}
                  className="px-4 py-3 text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors shadow-sm shrink-0"
                >
                  Back to Editor
                </button>
              ) : null}
              <a
                href={selectedWheel?.link}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex-1 py-3 px-4 rounded-xl font-black text-center text-sm shadow-md flex items-center justify-center gap-2 transition-all ${step === "ai_result" ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:opacity-90" : "bg-amber-500 text-black hover:bg-amber-400"
                  }`}
              >
                Buy {step === "ai_result" ? "These Wheels" : "on AsboRC"} <span className="text-lg">'</span>
              </a>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
