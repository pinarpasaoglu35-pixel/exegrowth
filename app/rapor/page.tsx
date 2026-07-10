import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DiffReview from "@/components/diff-review";
import { RUBRIC_LABELS } from "@/lib/rubric";
import type {
  Priority,
  ProfileDiffPayload,
  RubricScore,
  Skill,
  SkillDiffPayload,
} from "@/lib/db/types";

// The Baseline Report. Two modes:
//  - review: pending state_diffs rendered as "score + evidence — confirm or
//    push back" cards. The human has the last word.
//  - final: the persisted skill matrix + top-3 priorities.
export default async function ReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_step, goals, priorities")
    .eq("user_id", user.id)
    .single();
  const step = profile?.onboarding_step ?? "cv";
  if (step !== "rapor" && step !== "tamam") redirect("/onboarding");

  const { data: pending } = await supabase
    .from("state_diffs")
    .select("id, target_table, diff")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // ── Review mode ──
  if (pending && pending.length > 0) {
    const skillDiffs = pending
      .filter((d) => d.target_table === "skills")
      .map((d) => ({ id: d.id, diff: d.diff as SkillDiffPayload }));
    const profileRow = pending.find((d) => d.target_table === "profiles");
    const profileDiff = profileRow
      ? { id: profileRow.id, diff: profileRow.diff as ProfileDiffPayload }
      : null;
    return <DiffReview skillDiffs={skillDiffs} profileDiff={profileDiff} />;
  }

  // ── Final mode ──
  const { data: skills } = await supabase
    .from("skills")
    .select("*")
    .eq("user_id", user.id)
    .order("domain", { ascending: true })
    .order("score", { ascending: false });

  if (!skills || skills.length === 0) {
    // Everything was rejected: be honest about it.
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Baseline kaydedilmedi</h1>
        <p className="text-neutral-600">
          Tüm önerilere itiraz ettin, bu yüzden yetkinlik matrisin boş.
          İtirazların kaydedildi ve bir sonraki değerlendirmede dikkate
          alınacak. Yeniden değerlendirme akışı bir sonraki sürümde gelecek.
        </p>
      </main>
    );
  }

  const goals = typeof profile?.goals === "string" ? profile.goals : null;
  const priorities = (profile?.priorities ?? []) as Priority[];
  const grouped = (skills as Skill[]).reduce<Record<string, Skill[]>>(
    (acc, s) => {
      (acc[s.domain] ??= []).push(s);
      return acc;
    },
    {}
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <div>
        <p className="text-sm text-neutral-500">Baseline Raporu</p>
        <h1 className="mt-1 text-3xl font-semibold">Yetkinlik haritan</h1>
        {goals && (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-800">Hedefin</p>
            <p className="mt-1 text-neutral-600">{goals}</p>
          </div>
        )}
      </div>

      {priorities.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">İlk 3 gelişim önceliği</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {priorities.map((p, i) => (
              <li
                key={i}
                className="rounded-xl border border-neutral-200 bg-white p-5"
              >
                <p className="font-semibold">
                  {i + 1}. {p.skill_name}
                </p>
                <p className="mt-1 text-sm text-neutral-600">{p.why}</p>
                <p className="mt-2 text-sm text-neutral-600">
                  <span className="font-medium text-neutral-800">
                    İlk adım (önümüzdeki 2 hafta):
                  </span>{" "}
                  {p.first_step}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold">Yetkinlik matrisi</h2>
        {Object.entries(grouped).map(([domain, domainSkills]) => (
          <div key={domain}>
            <h3 className="mb-2 font-medium text-neutral-500">{domain}</h3>
            <div className="flex flex-col gap-2">
              {domainSkills.map((skill) => {
                const rubric = skill.score
                  ? RUBRIC_LABELS[skill.score as RubricScore]
                  : null;
                return (
                  <details
                    key={skill.id}
                    className="rounded-xl border border-neutral-200 bg-white p-4"
                  >
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{skill.name}</span>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                          {skill.category}
                        </span>
                        {skill.provisional && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            geçici
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <span
                            key={i}
                            className={`h-3 w-3 rounded-full ${
                              skill.score && i <= skill.score
                                ? "bg-neutral-900"
                                : "bg-neutral-200"
                            }`}
                          />
                        ))}
                      </span>
                    </summary>
                    <div className="mt-3 flex flex-col gap-3 border-t border-neutral-100 pt-3 text-sm">
                      {rubric && (
                        <p className="text-neutral-500">
                          {skill.score} — {rubric.name}: {rubric.tr}
                        </p>
                      )}
                      <div>
                        <p className="font-medium text-neutral-800">Kanıt</p>
                        <p className="whitespace-pre-line text-neutral-600">
                          {skill.evidence}
                        </p>
                      </div>
                      {skill.counter_argument && (
                        <div>
                          <p className="font-medium text-neutral-800">
                            Karşı argüman
                          </p>
                          <p className="text-neutral-600">
                            {skill.counter_argument}
                          </p>
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <p className="pb-8 text-sm text-neutral-400">
        12 haftalık kişisel yol haritan bir sonraki aşamada burada olacak.
      </p>
    </main>
  );
}
