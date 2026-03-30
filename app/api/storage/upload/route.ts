import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const bucket = formData.get("bucket");
  const folder = formData.get("folder");

  if (!bucket || typeof bucket !== "string") {
    return NextResponse.json({ error: "Bucket required" }, { status: 400 });
  }

  const allowedBuckets = ["event-images", "profile-photos", "memories"];
  if (!allowedBuckets.includes(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  if (!file.type || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Images only" }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY missing" },
      { status: 500 }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase client unavailable" }, { status: 500 });
  }

  const extension = file.name.split(".").pop() || "jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const filePath = folder && typeof folder === "string" ? `${folder}/${fileName}` : fileName;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filePath, buffer, { upsert: true, contentType: file.type || undefined });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath);

  return NextResponse.json({ publicUrl: data.publicUrl, path: filePath });
}
