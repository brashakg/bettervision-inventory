import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activityLog";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const REMOVEBG_API_KEY = process.env.REMOVEBG_API_KEY;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max file size

async function ensureUploadDir() {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error("Error creating upload directory:", error);
  }
}

async function removeBackground(imageBuffer: Buffer): Promise<Buffer | null> {
  if (!REMOVEBG_API_KEY) {
    return null;
  }

  try {
    const formData = new FormData();
    formData.append("image_file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }));
    formData.append("size", "auto");
    formData.append("type", "product");

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": REMOVEBG_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      console.error(
        "Remove.bg API error:",
        response.status,
        response.statusText
      );
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("Error removing background:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (!auth.authorized) return auth.response!;

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "File must be an image" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB. Please compress the image before uploading.` },
        { status: 400 }
      );
    }

    await ensureUploadDir();

    const buffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);

    const fileName = `${randomBytes(8).toString("hex")}-${Date.now()}.${
      file.type.split("/")[1] || "png"
    }`;
    const filePath = join(UPLOAD_DIR, fileName);

    await writeFile(filePath, fileBuffer);

    const urls: Record<string, string> = {
      original: `/uploads/${fileName}`,
    };

    if (REMOVEBG_API_KEY) {
      const processedBuffer = await removeBackground(fileBuffer);

      if (processedBuffer) {
        const processedFileName = `${randomBytes(8).toString("hex")}-${Date.now()}-nobg.png`;
        const processedPath = join(UPLOAD_DIR, processedFileName);
        await writeFile(processedPath, processedBuffer);
        urls.processed = `/uploads/${processedFileName}`;
      }
    }

    // Log activity
    logActivity({
      userId: (auth.session?.user as any)?.id,
      userName: auth.session?.user?.name,
      userEmail: auth.session?.user?.email,
      action: "UPLOAD",
      entity: "IMAGE",
      entityId: fileName,
      details: `Uploaded image: ${file.name} (${(fileBuffer.length / 1024).toFixed(1)}KB)`,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          fileName,
          urls,
          size: fileBuffer.length,
        },
        message: "Image uploaded successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
