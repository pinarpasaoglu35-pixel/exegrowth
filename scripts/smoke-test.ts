/**
 * EGOS Phase 1 end-to-end smoke test.
 *
 * Exercises the whole flow over real HTTP against a running app instance:
 * disposable user → CV parse (fake PDF) → profile confirm → adaptive
 * interview (with one deliberately vague answer) → both diagnostics →
 * state_diffs assertions → resolve (approve most, reject one with a note)
 * → final skills/skill_history/profiles assertions → cleanup.
 *
 * Usage:
 *   Terminal 1: npm run dev
 *   Terminal 2: npm run smoke          (add -- --keep to keep the test user)
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Optional: SMOKE_BASE_URL (default http://localhost:3000).
 *
 * Notes: makes ~10-12 real AI calls per run. Pipe failures are errors;
 * model-quality judgments (e.g. "did the follow-up fire?") are warnings.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────
// Env loading (.env.local then .env — same precedence as Next.js)
// ─────────────────────────────────────────────────────────────────────
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const KEEP_USER = process.argv.includes("--keep");

// ─────────────────────────────────────────────────────────────────────
// Tiny test harness
// ─────────────────────────────────────────────────────────────────────
let failures = 0;
let warnings = 0;

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function warn(msg: string) {
  warnings++;
  console.log(`  ⚠ WARN: ${msg}`);
}
function fail(msg: string): never {
  failures++;
  throw new Error(msg);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
  ok(msg);
}
function step(title: string) {
  console.log(`\n■ ${title}`);
}

// ─────────────────────────────────────────────────────────────────────
// Minimal valid PDF with the fake CV (ASCII text, one page)
// ─────────────────────────────────────────────────────────────────────
const FAKE_CV_LINES = [
  "Deniz Yilmaz",
  "Senior Product Manager",
  "",
  "SUMMARY",
  "Product manager with 7 years of experience in B2B SaaS.",
  "",
  "EXPERIENCE",
  "Senior Product Manager - Akara Software (2021-03 - present)",
  "- Led pricing revamp that increased ARR by 18 percent",
  "- Ran discovery for the analytics module with 40+ customer interviews",
  "Product Manager - Bulut CRM (2018-06 - 2021-02)",
  "- Shipped mobile app v1 with a team of 5 engineers",
  "- Introduced quarterly OKR process for the product team",
  "",
  "EDUCATION",
  "Bogazici University - BSc Industrial Engineering (2017)",
  "",
  "SKILLS",
  "Product strategy, SQL, Team leadership, Stakeholder management",
  "",
  "LANGUAGES",
  "Turkish, English",
];

function buildFakePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = [
    "BT",
    "/F1 11 Tf",
    "50 770 Td",
    "14 TL",
    ...lines.map((l) => `(${esc(l)}) Tj T*`),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// ─────────────────────────────────────────────────────────────────────
// Auth cookies in @supabase/ssr's format (base64url JSON, chunked)
// ─────────────────────────────────────────────────────────────────────
function buildAuthCookieHeader(session: Session): string {
  const ref = new URL(SUPABASE_URL!).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  const value =
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const MAX_CHUNK = 3180;
  if (value.length <= MAX_CHUNK) return `${name}=${value}`;
  const parts: string[] = [];
  for (let i = 0; i * MAX_CHUNK < value.length; i++) {
    parts.push(`${name}.${i}=${value.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK)}`);
  }
  return parts.join("; ");
}

// ─────────────────────────────────────────────────────────────────────
// Authenticated fetch against the app
// ─────────────────────────────────────────────────────────────────────
let cookieHeader = "";

async function api(path: string, body?: BodyInit, json?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      cookie: cookieHeader,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ─────────────────────────────────────────────────────────────────────
// Scripted interview answers (persona: the fake CV's Deniz)
// Answer #2 is DELIBERATELY VAGUE to exercise the follow-up logic.
// ─────────────────────────────────────────────────────────────────────
const VAGUE_ANSWER =
  "Genel olarak her seyi yonetiyorum iste, urunle ilgili ne varsa ben ilgileniyorum.";

const ANSWER_BANK = [
  // 1: goals
  "Onumuzdeki iki yil icinde urun direktoru olmak istiyorum. Benim icin 'daha iyi' su demek: stratejik kararlarda soz sahibi olmak ve birden fazla urun ekibini yonetebilmek.",
  // 2: deliberately vague
  VAGUE_ANSWER,
  // 3+: concrete answers, cycled as needed
  "Somut ornek: fiyatlandirma revizyonunda uc paketten olusan yeni model tasarladim. 25 musteriyle gorusme yaptim, rakip analizini ben hazirladim, CFO ile birlikte marj simulasyonu kurduk. Sonuc: ARR yuzde 18 artti, churn degismedi.",
  "SQL'i gunluk isimde kullaniyorum: funnel analizleri icin kendi sorgularimi yazarim, ornegin gecen ay aktivasyon dususunu segment bazinda ben tespit ettim. Karmasik window function gerektiginde veri ekibinden destek alirim.",
  "Zor bir karar: mobil uygulamada offline mod mu yoksa bildirim altyapisi mi onceliklendirilecekti. Veri yetersizdi; iki haftalik bir spike yaptirdim, destek taleplerini analiz ettim ve bildirimi sectim cunku kullanim verisi onu destekliyordu. Sonradan dogru karar oldugu anlasildi, aktiflik yuzde 12 artti.",
  "Gecen yil yoneticimden aldigim elestiri: paydas yonetiminde muhendislik ekibini gec bilgilendiriyormusum. Bunun uzerine haftalik teknik sync baslattim ve roadmap degisikliklerini once muhendislik lead'iyle konusur oldum.",
  "Ekip liderligi konusunda dogrudan raporum yok ama 5 kisilik capraz fonksiyonlu ekibi urun tarafinda ben yonlendiriyorum: sprint hedeflerini ben belirlerim, retrolari ben yonetirim.",
  "Onceliklendirmede RICE kullaniyorum ama korukorune degil; ornegin dusuk skorlu bir uyumluluk isini yasal risk nedeniyle one aldigim oldu. Skorun anlatmadigi bagimliliklari elle degerlendiririm.",
  "Kariyerimde en cok gelistirmem gereken alan bence veri bilimi tarafi: SQL biliyorum ama istatistiksel modelleme konusunda yuzeyselim, A/B test sonuclarini yorumlarken veri ekibine bagimliyim.",
  "Paydas catismasi ornegi: satis ekibi ozel bir musteri icin ozellestirme istiyordu, ben roadmap'i savundum. CEO'ya iki senaryonun maliyetini cikarip sundum; ortak cozum olarak API uzerinden kismi ozellestirme yaptik.",
];

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("EGOS Phase 1 smoke test");
  console.log(`Target: ${BASE_URL}`);

  step("0. Preconditions");
  assert(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL is set");
  assert(ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY is set");
  assert(
    SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY is set (Supabase Dashboard > Settings > API)"
  );
  const reachable = await fetch(BASE_URL).catch(() => null);
  assert(reachable, `App is reachable at ${BASE_URL} (is 'npm run dev' running?)`);

  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `smoke+${Date.now()}@example.com`;
  const password = `Smoke-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  let userId: string | null = null;

  try {
    step("1. Disposable test user");
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    assert(!createError && created?.user, `User created: ${email}`);
    userId = created.user.id;

    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn, error: signInError } =
      await anonClient.auth.signInWithPassword({ email, password });
    assert(!signInError && signIn.session, "Signed in with password");
    cookieHeader = buildAuthCookieHeader(signIn.session);
    ok("Auth cookies built (@supabase/ssr format)");

    // The signup trigger should have created the profile row.
    const { data: profileRow } = await admin
      .from("profiles")
      .select("onboarding_step")
      .eq("user_id", userId)
      .single();
    assert(profileRow, "Profile row auto-created by signup trigger");

    step("2. CV parse (fake PDF, parse-and-discard)");
    const pdf = buildFakePdf(FAKE_CV_LINES);
    ok(`Fake PDF built (${pdf.length} bytes)`);

    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array(pdf)], "cv.pdf", { type: "application/pdf" })
    );
    const parse = await api("/api/cv/parse", formData);
    assert(parse.status === 200, `CV parse returned 200 (got ${parse.status}: ${JSON.stringify(parse.data).slice(0, 200)})`);
    const cv = parse.data.cv;
    assert(
      typeof cv?.full_name === "string" && cv.full_name.length > 0,
      `Parsed full_name: "${cv?.full_name}"`
    );
    assert(
      Array.isArray(cv.experience) && cv.experience.length >= 1,
      `Parsed ${cv.experience?.length} experience entries`
    );
    assert(
      Array.isArray(cv.skills_claimed) && cv.skills_claimed.length >= 2,
      `Parsed ${cv.skills_claimed?.length} claimed skills`
    );

    step("3. Profile confirm");
    const confirm = await api("/api/profile", undefined, {
      cv,
      source: "parsed",
    });
    assert(confirm.status === 200, "Profile confirmed");
    const { data: afterConfirm } = await admin
      .from("profiles")
      .select("onboarding_step, cv_source")
      .eq("user_id", userId)
      .single();
    assert(
      afterConfirm?.onboarding_step === "gorusme" &&
        afterConfirm.cv_source === "parsed",
      "onboarding_step=gorusme, cv_source=parsed"
    );

    step("4. Interview (scripted; answer #2 deliberately vague)");
    const first = await api("/api/interview", undefined, {});
    assert(
      first.status === 200 && first.data.done === false && first.data.question,
      `Opening question received: "${String(first.data.question).slice(0, 80)}…"`
    );

    let answerIdx = 0;
    let turns = 0;
    let done = false;
    let questionAfterVague: string | null = null;

    while (!done && turns < 12) {
      const answer =
        ANSWER_BANK[Math.min(answerIdx, ANSWER_BANK.length - 1)];
      const wasVague = answer === VAGUE_ANSWER;
      const turn = await api("/api/interview", undefined, { answer });
      assert(
        turn.status === 200,
        `Turn ${turns + 1} accepted (answer #${answerIdx + 1})`
      );
      if (wasVague && !turn.data.done) {
        questionAfterVague = turn.data.question;
      }
      done = turn.data.done === true;
      answerIdx++;
      turns++;
    }
    assert(done, `Interview completed after ${turns} answers`);
    assert(turns >= 6 && turns <= 10, `Turn count ${turns} is within 6-10`);

    if (questionAfterVague) {
      const followUpKeywords = ["örnek", "ornek", "somut", "hangi", "anlat", "detay", "spesifik"];
      const fired = followUpKeywords.some((k) =>
        questionAfterVague!.toLocaleLowerCase("tr").includes(k)
      );
      if (fired) {
        ok(`Follow-up fired after vague answer: "${questionAfterVague.slice(0, 90)}…"`);
      } else {
        warn(
          `Question after the vague answer doesn't look like a concrete-example follow-up: "${questionAfterVague.slice(0, 120)}". Model judgment — verify manually.`
        );
      }
    }

    const { data: interviewSession } = await admin
      .from("sessions")
      .select("id, status, kernel_version, metadata")
      .eq("user_id", userId)
      .eq("kind", "onboarding_interview")
      .single();
    assert(
      interviewSession?.status === "completed" &&
        interviewSession.kernel_version === "v1",
      "Interview session completed, kernel_version=v1"
    );
    const qa = interviewSession.metadata?.interview_state?.questions_asked ?? [];
    assert(qa.length === turns, `Interview state captured ${qa.length} Q&As`);
    assert(
      qa.every(
        (q: { answer_summary?: string; signals?: string[] }) =>
          q.answer_summary && Array.isArray(q.signals)
      ),
      "Every Q&A has answer_summary and signals"
    );
    const { count: msgCount } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", interviewSession.id);
    assert((msgCount ?? 0) >= turns * 2, `Transcript archived (${msgCount} messages)`);

    step("5. Diagnostic exercises");
    const start = await api("/api/diagnostic", undefined, { action: "start" });
    assert(start.status === 200 && start.data.exercises, "Exercises generated");
    const items: string[] = start.data.exercises.prioritization.items;
    assert(items.length === 5, "Prioritization has exactly 5 items");
    assert(
      typeof start.data.exercises.case.scenario === "string" &&
        start.data.exercises.case.scenario.length > 50,
      "Case scenario is substantial"
    );

    const caseSubmit = await api("/api/diagnostic", undefined, {
      action: "submit_case",
      response:
        "Once durumu netlestiririm: hangi paydasin beklentisi kritik, hangi kisit gercek? Ilk adim olarak elimdeki veriyi toplar ve iki secenegin maliyetini karsilastiririm. Sonra en riskli varsayimi test edecek kucuk bir deney tasarlarim. Karari tek basima vermem; etkilenen ekiplerle kisa bir hizalanma yapar, gerekceyi yazili paylasirim. Sonucu iki hafta icinde olculebilir bir metrikle takip ederim ve yanildiysam geri donus planim hazir olur.",
    });
    assert(caseSubmit.status === 200, "Case response submitted");

    console.log("  … scoring pass running (30-90s)");
    const prioritizationSubmit = await api("/api/diagnostic", undefined, {
      action: "submit_prioritization",
      order: [2, 0, 4, 1, 3],
      justification:
        "Ilk siraya koydugum madde dogrudan gelir kaybini durduruyor; diger maddeler onemli ama geri dondurulebilir, bu yuzden aciliyet ve etki kombinasyonu en yuksek olani sectim.",
    });
    assert(
      prioritizationSubmit.status === 200 && prioritizationSubmit.data.done,
      "Prioritization submitted; scoring pass completed"
    );

    step("6. state_diffs assertions");
    const { data: diffs } = await admin
      .from("state_diffs")
      .select("id, target_table, diff, status")
      .eq("user_id", userId)
      .eq("status", "pending");
    assert(diffs && diffs.length >= 5, `${diffs?.length} pending diffs created`);

    const skillDiffs = diffs.filter((d) => d.target_table === "skills");
    const profileDiffs = diffs.filter((d) => d.target_table === "profiles");
    assert(
      skillDiffs.length >= 4 && skillDiffs.length <= 12,
      `${skillDiffs.length} skill proposals (4-12 expected)`
    );
    assert(profileDiffs.length === 1, "Exactly one profiles proposal");

    for (const d of skillDiffs) {
      const s = d.diff as {
        name?: string;
        score?: number;
        evidence?: string;
        counter_argument?: string;
        justification_4plus?: string | null;
      };
      if (!s.evidence || s.evidence.trim().length < 10) {
        fail(`Skill "${s.name}" has empty/thin evidence`);
      }
      if (!s.counter_argument || s.counter_argument.trim().length < 10) {
        fail(`Skill "${s.name}" has empty/thin counter_argument`);
      }
      if ((s.score ?? 0) >= 4 && !s.justification_4plus) {
        fail(`Skill "${s.name}" scored ${s.score} without justification_4plus`);
      }
    }
    ok("Every skill proposal has evidence + counter_argument; 4+ justified");
    const profilePayload = profileDiffs[0].diff as {
      goals?: string;
      priorities?: unknown[];
    };
    assert(
      typeof profilePayload.goals === "string" &&
        (profilePayload.priorities?.length ?? 0) >= 1,
      "Profiles proposal carries goals + priorities"
    );

    step("7. Resolve: approve all but one, reject one with a note");
    const rejected = skillDiffs[skillDiffs.length - 1];
    const resolutions = [
      ...skillDiffs
        .slice(0, -1)
        .map((d) => ({ id: d.id, action: "approve" as const })),
      {
        id: rejected.id,
        action: "reject" as const,
        note: "Smoke test itirazi: kanit yetersiz buldum.",
      },
      { id: profileDiffs[0].id, action: "approve" as const },
    ];
    const resolve = await api("/api/diffs/resolve", undefined, { resolutions });
    assert(resolve.status === 200, "Resolve call succeeded");
    assert(resolve.data.remaining === 0, "No pending diffs remain");
    const failedResults = (resolve.data.results as { ok: boolean }[]).filter(
      (r) => !r.ok
    );
    assert(failedResults.length === 0, "All resolutions applied cleanly");

    step("8. Final state assertions");
    const approvedCount = skillDiffs.length - 1;
    const { data: skills } = await admin
      .from("skills")
      .select("id, name, score, evidence, counter_argument, provisional")
      .eq("user_id", userId);
    assert(
      skills?.length === approvedCount,
      `skills has ${skills?.length} rows (= approved count ${approvedCount})`
    );
    assert(
      skills.every((s) => s.evidence && s.counter_argument && s.provisional),
      "Every skill row has evidence, counter_argument, provisional=true"
    );
    const rejectedName = (rejected.diff as { name?: string }).name;
    assert(
      !skills.some((s) => s.name === rejectedName),
      `Rejected skill "${rejectedName}" is absent from skills`
    );

    const { count: historyCount } = await admin
      .from("skill_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    assert(
      historyCount === approvedCount,
      `skill_history has ${historyCount} rows (1 per approved skill)`
    );

    const { data: finalProfile } = await admin
      .from("profiles")
      .select("goals, priorities, onboarding_step")
      .eq("user_id", userId)
      .single();
    assert(
      typeof finalProfile?.goals === "string" &&
        Array.isArray(finalProfile.priorities),
      "profiles.goals + priorities written"
    );
    assert(
      finalProfile.onboarding_step === "tamam",
      "onboarding_step=tamam — onboarding complete"
    );

    const { data: rejectedRow } = await admin
      .from("state_diffs")
      .select("status, user_note")
      .eq("id", rejected.id)
      .single();
    assert(
      rejectedRow?.status === "rejected" &&
        !!rejectedRow.user_note?.includes("Smoke test"),
      "Rejected diff carries status=rejected + user_note"
    );
  } finally {
    if (userId && !KEEP_USER) {
      step("9. Cleanup");
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        console.log(`  ⚠ Could not delete test user ${email}: ${error.message}`);
      } else {
        ok(`Test user deleted (${email}) — all rows cascade with it`);
      }
    } else if (userId && KEEP_USER) {
      console.log(`\n■ --keep: test user retained → ${email} / ${password}`);
    }
  }

  console.log(
    `\n${failures === 0 ? "✅ SMOKE TEST PASSED" : "❌ SMOKE TEST FAILED"}` +
      (warnings > 0 ? ` (${warnings} warning${warnings > 1 ? "s" : ""} — check above)` : "")
  );
}

main().catch((err) => {
  console.error(`\n  ✗ FAIL: ${err.message}`);
  console.log("\n❌ SMOKE TEST FAILED");
  process.exit(1);
});
