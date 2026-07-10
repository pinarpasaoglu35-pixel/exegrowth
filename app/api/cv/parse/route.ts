import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getProvider } from "@/lib/ai/provider";
import { CV_PARSE_SYSTEM, CV_PARSE_INSTRUCTION } from "@/lib/ai/kernel";
import { cvJsonSchema, CV_JSON_SCHEMA } from "@/lib/ai/schemas";

// AI parsing can take a while on long CVs.
export const maxDuration = 60;

// Vercel's request-body limit is ~4.5 MB; stay under it.
const MAX_PDF_BYTES = 4 * 1024 * 1024;

// PARSE-AND-DISCARD (KVKK): the uploaded PDF only ever exists in this
// function's memory. It is sent to the AI for parsing and never written to
// disk, storage, or the database. The only thing persisted later is the
// user-edited cv_json, via /api/profile after explicit confirmation.
export async function POST(request: Request) {
  // In-route auth — middleware alone is not enough, the Anthropic key is
  // server-side and must never serve anonymous traffic.
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Lütfen PDF formatında bir dosya yükle." },
      { status: 400 }
    );
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: "Dosya çok büyük (en fazla 4 MB)." },
      { status: 400 }
    );
  }

  const dataBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const raw = await getProvider().complete({
      system: CV_PARSE_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "pdf", dataBase64 },
            { type: "text", text: CV_PARSE_INSTRUCTION },
          ],
        },
      ],
      jsonSchema: CV_JSON_SCHEMA,
    });

    // Validate before trusting: AI output is external input.
    const cv = cvJsonSchema.parse(JSON.parse(raw));
    return NextResponse.json({ cv });
  } catch (err) {
    console.error("CV parse failed:", err);
    return NextResponse.json(
      {
        error:
          "CV'n otomatik olarak okunamadı. Bilgilerini elle girerek devam edebilirsin.",
      },
      { status: 502 }
    );
  }
}
