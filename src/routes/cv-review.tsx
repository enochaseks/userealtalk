import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import {
  consumeMeteredFeature,
  hasFeatureAccess,
  loadSubscriptionSnapshot,
  type SubscriptionPlan,
  type SubscriptionSnapshot,
} from "@/lib/subscriptions";

export const Route = createFileRoute("/cv-review")({
  component: CvReviewPage,
  head: () => ({
    meta: [{ title: "CV Reviewer - RealTalk" }],
  }),
});

type SectionReview = {
  section: string;
  score: number;
  note: string;
};

type CvReviewResult = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  sectionReviews: SectionReview[];
};

const DEFAULT_SCHEMA_EXAMPLE = {
  score: 7.2,
  summary: "Short summary of current CV quality and key improvements.",
  strengths: ["A clear strength", "Another strength"],
  improvements: ["Highest impact change", "Second highest impact change"],
  sectionReviews: [
    {
      section: "Experience",
      score: 7.5,
      note: "Achievements are clear but need more measurable outcomes.",
    },
  ],
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, value));
}

function normalizeReview(raw: unknown): CvReviewResult | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;

  const strengths = Array.isArray(source.strengths)
    ? source.strengths.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : [];
  const improvements = Array.isArray(source.improvements)
    ? source.improvements.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : [];

  const sectionReviews = Array.isArray(source.sectionReviews)
    ? source.sectionReviews
        .map((item) => {
          const entry = item as Record<string, unknown>;
          return {
            section: String(entry.section ?? "General").trim(),
            score: clampScore(Number(entry.score ?? 0)),
            note: String(entry.note ?? "").trim(),
          };
        })
        .filter((item) => item.section && item.note)
        .slice(0, 10)
    : [];

  return {
    score: clampScore(Number(source.score ?? 0)),
    summary: String(source.summary ?? "").trim(),
    strengths,
    improvements,
    sectionReviews,
  };
}

function parseReviewFromResponse(raw: string): CvReviewResult | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return normalizeReview(JSON.parse(cleaned));
  } catch {
    // Continue to object extraction fallback.
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    const maybeJson = cleaned.slice(firstBrace, lastBrace + 1);
    return normalizeReview(JSON.parse(maybeJson));
  } catch {
    return null;
  }
}

// ─── Types for extra tools ─────────────────────────────────────────────────────

type JobMatchResult = {
  atsScore: number;
  summary: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
};

type TransferableSkill = {
  skill: string;
  evidence: string;
  relevance: string;
};

type TransferableResult = {
  skills: TransferableSkill[];
  summary: string;
};

// ─── Helper ────────────────────────────────────────────────────────────────────

async function callCvTool(tool: string, payload: Record<string, unknown>): Promise<unknown> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-tools`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ tool, ...payload }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(String(json?.error || "Request failed"));
  return json?.result;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

function CvReviewPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // ── Shared CV state ──────────────────────────────────────────────────────────
  const [fileName, setFileName] = useState("");
  const [cvText, setCvText] = useState("");
  const [targetRole, setTargetRole] = useState("");

  // ── Tab 1: CV Review ─────────────────────────────────────────────────────────
  const [isReviewing, setIsReviewing] = useState(false);
  const [review, setReview] = useState<CvReviewResult | null>(null);
  const [rawReply, setRawReply] = useState("");

  // ── Tab 2: Job Matcher ───────────────────────────────────────────────────────
  const [jobDescription, setJobDescription] = useState("");
  const [isMatching, setIsMatching] = useState(false);
  const [jobMatch, setJobMatch] = useState<JobMatchResult | null>(null);

  // ── Tab 3: Cover Letter ──────────────────────────────────────────────────────
  const [coverJd, setCoverJd] = useState("");
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");

  // ── Tab 4: CV Rewrite ────────────────────────────────────────────────────────
  const [sectionName, setSectionName] = useState("");
  const [sectionText, setSectionText] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewritten, setRewritten] = useState("");

  // ── Tab 5: Skills & Personal Statement ──────────────────────────────────────
  const [isExtractingSkills, setIsExtractingSkills] = useState(false);
  const [transferable, setTransferable] = useState<TransferableResult | null>(null);
  const [targetGoal, setTargetGoal] = useState("");
  const [isGeneratingStatement, setIsGeneratingStatement] = useState(false);
  const [personalStatement, setPersonalStatement] = useState("");

  // ── Subscription ─────────────────────────────────────────────────────────────
  const [snapshot, setSnapshot] = useState<SubscriptionSnapshot | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, navigate, user]);

  useEffect(() => {
    if (user) {
      loadSubscriptionSnapshot(user.id).then(setSnapshot).catch(() => {});
    }
  }, [user]);

  const plan: SubscriptionPlan = snapshot?.plan ?? "free";
  const cvRemaining = snapshot?.usage.cv_toolkit?.remaining ?? null;
  const cvLimit = snapshot?.usage.cv_toolkit?.limit ?? null;

  // Which tabs are accessible on this plan
  const canCoverLetter = plan === "pro" || plan === "platinum" || plan === "student" || plan === "professional";
  const canSkillsStatement = plan === "platinum" || plan === "student" || plan === "professional";

  // Check quota and consume one cv_toolkit use
  const checkAndConsumeCvQuota = async (): Promise<boolean> => {
    if (!user) return false;
    const result = await consumeMeteredFeature(user.id, "cv_toolkit");
    if (!result.allowed) {
      toast.error(`CV Toolkit limit reached for today (${cvLimit} uses). Resets tomorrow.`);
      return false;
    }
    setSnapshot(result.snapshot);
    return true;
  };

  const cvWordCount = useMemo(
    () => cvText.trim().split(/\s+/).filter(Boolean).length,
    [cvText],
  );

  // ── Upload handler ───────────────────────────────────────────────────────────
  const onUploadCv = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("CV file is too large. Please upload a file under 3MB.");
      return;
    }
    setFileName(file.name);
    setReview(null);
    setRawReply("");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    try {
      let extractedText = "";
      if (ext === "pdf") {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageTexts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pageTexts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        }
        extractedText = pageTexts.join("\n");
      } else if (ext === "docx") {
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else {
        extractedText = await file.text();
      }
      const normalizedText = extractedText.replace(/\u0000/g, "").trim();
      if (normalizedText.length < 200) {
        toast.error("Could not extract enough text. Try a plain .txt export or paste below.");
        return;
      }
      setCvText(normalizedText);
      toast.success("CV uploaded. You can edit before running any tool.");
    } catch {
      toast.error("Failed to read CV file. Try a plain .txt export or paste below.");
    }
  };

  // ── Tab 1: Run review ────────────────────────────────────────────────────────
  const runReview = async () => {
    if (isReviewing || !user) return;
    const trimmed = cvText.trim();
    if (trimmed.length < 250) { toast.error("Please provide more CV content."); return; }
    if (!await checkAndConsumeCvQuota()) return;
    setIsReviewing(true);
    setReview(null);
    setRawReply("");
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cv-review`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ cvText: trimmed, targetRole: targetRole.trim() || null }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(String(json?.error || "Failed to review CV"));
      const normalized = normalizeReview(json?.result);
      if (!normalized) { setRawReply(JSON.stringify(json?.result ?? json)); throw new Error("Could not parse AI review."); }
      setReview(normalized);
      toast.success("CV review complete.");
    } catch (e: any) {
      toast.error(e?.message || "Could not run CV review right now.");
    } finally {
      setIsReviewing(false);
    }
  };

  // ── Tab 2: Job match ─────────────────────────────────────────────────────────
  const runJobMatch = async () => {
    if (isMatching || !user) return;
    if (cvText.trim().length < 250) { toast.error("Please add CV content first."); return; }
    if (jobDescription.trim().length < 50) { toast.error("Please paste a job description."); return; }
    if (!await checkAndConsumeCvQuota()) return;
    setIsMatching(true);
    setJobMatch(null);
    try {
      const result = await callCvTool("job-match", { cvText: cvText.trim(), jobDescription: jobDescription.trim() }) as JobMatchResult;
      setJobMatch(result);
      toast.success("Job match complete.");
    } catch (e: any) {
      toast.error(e?.message || "Job match failed. Try again.");
    } finally {
      setIsMatching(false);
    }
  };

  // ── Tab 3: Cover letter ──────────────────────────────────────────────────────
  const runCoverLetter = async () => {
    if (isGeneratingCover || !user) return;
    if (cvText.trim().length < 250) { toast.error("Please add CV content first."); return; }
    if (coverJd.trim().length < 50) { toast.error("Please paste a job description."); return; }
    if (!await checkAndConsumeCvQuota()) return;
    setIsGeneratingCover(true);
    setCoverLetter("");
    try {
      const result = await callCvTool("cover-letter", { cvText: cvText.trim(), jobDescription: coverJd.trim() }) as { coverLetter: string };
      setCoverLetter(result?.coverLetter ?? "");
      toast.success("Cover letter ready.");
    } catch (e: any) {
      toast.error(e?.message || "Cover letter generation failed.");
    } finally {
      setIsGeneratingCover(false);
    }
  };

  // ── Tab 4: Section rewrite ───────────────────────────────────────────────────
  const runRewrite = async () => {
    if (isRewriting || !user) return;
    if (sectionText.trim().length < 30) { toast.error("Please paste the section text to rewrite."); return; }
    if (!await checkAndConsumeCvQuota()) return;
    setIsRewriting(true);
    setRewritten("");
    try {
      const result = await callCvTool("cv-rewrite", { sectionName: sectionName.trim() || "Section", sectionText: sectionText.trim() }) as { rewritten: string };
      setRewritten(result?.rewritten ?? "");
      toast.success("Rewrite ready.");
    } catch (e: any) {
      toast.error(e?.message || "Rewrite failed. Try again.");
    } finally {
      setIsRewriting(false);
    }
  };

  // ── Tab 5a: Transferable skills ──────────────────────────────────────────────
  const runTransferableSkills = async () => {
    if (isExtractingSkills || !user) return;
    if (cvText.trim().length < 250) { toast.error("Please add CV content first."); return; }
    if (!await checkAndConsumeCvQuota()) return;
    setIsExtractingSkills(true);
    setTransferable(null);
    try {
      const result = await callCvTool("transferable-skills", { cvText: cvText.trim() }) as TransferableResult;
      setTransferable(result);
      toast.success("Skills extracted.");
    } catch (e: any) {
      toast.error(e?.message || "Skills extraction failed.");
    } finally {
      setIsExtractingSkills(false);
    }
  };

  // ── Tab 5b: Personal statement ───────────────────────────────────────────────
  const runPersonalStatement = async () => {
    if (isGeneratingStatement || !user) return;
    if (cvText.trim().length < 250) { toast.error("Please add CV content first."); return; }
    if (!await checkAndConsumeCvQuota()) return;
    setIsGeneratingStatement(true);
    setPersonalStatement("");
    try {
      const result = await callCvTool("personal-statement", { cvText: cvText.trim(), targetGoal: targetGoal.trim() || null }) as { personalStatement: string };
      setPersonalStatement(result?.personalStatement ?? "");
      toast.success("Personal statement ready.");
    } catch (e: any) {
      toast.error(e?.message || "Personal statement generation failed.");
    } finally {
      setIsGeneratingStatement(false);
    }
  };

  // ── CV upload card (shared across all tabs) ──────────────────────────────────
  const CvUploadCard = (
    <Card>
      <CardHeader>
        <CardTitle>Your CV</CardTitle>
        <CardDescription>Upload or paste your CV. All tools on this page use it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="cv-file">Upload File</Label>
          <Input
            id="cv-file"
            type="file"
            accept=".txt,.md,.pdf,.doc,.docx"
            onChange={(e) => void onUploadCv(e.target.files?.[0])}
          />
          {fileName ? <p className="text-xs text-foreground">Loaded: {fileName}</p> : (
            <p className="text-xs text-muted-foreground">PDF, DOCX, or plain text. Max 3 MB.</p>
          )}
        </div>
        <Textarea
          value={cvText}
          onChange={(e) => setCvText(e.target.value)}
          placeholder="Or paste your CV text here…"
          className="min-h-[180px]"
        />
        <p className="text-xs text-muted-foreground">{cvWordCount} words</p>
      </CardContent>
    </Card>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">CV Toolkit</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload your CV once and use any of the tools below.
        </p>
      </div>

      <Tabs defaultValue="review">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <TabsList className="flex h-auto flex-wrap gap-1">
            <TabsTrigger value="review">Review &amp; Score</TabsTrigger>
            <TabsTrigger value="job-match">Job Matcher</TabsTrigger>
            <TabsTrigger value="rewrite">Rewrite Section</TabsTrigger>
            <TabsTrigger value="cover-letter" disabled={!canCoverLetter} title={!canCoverLetter ? "Pro plan or higher required" : undefined}>
              Cover Letter{!canCoverLetter && " 🔒"}
            </TabsTrigger>
            <TabsTrigger value="skills" disabled={!canSkillsStatement} title={!canSkillsStatement ? "Platinum / Student / Professional plan required" : undefined}>
              Skills &amp; Statement{!canSkillsStatement && " 🔒"}
            </TabsTrigger>
          </TabsList>
          {cvLimit !== null && (
            <span className="text-muted-foreground text-xs">
              CV toolkit: {cvRemaining ?? cvLimit}/{cvLimit} uses left today
            </span>
          )}
        </div>

        {/* ── Tab 1: Review & Score ─────────────────────────────────────────── */}
        <TabsContent value="review" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Review Settings</CardTitle>
                <CardDescription>Optionally set a target role before scoring.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cv-file-review">CV File</Label>
                  <Input
                    id="cv-file-review"
                    type="file"
                    accept=".txt,.md,.pdf,.doc,.docx"
                    onChange={(e) => void onUploadCv(e.target.files?.[0])}
                  />
                  {fileName ? <p className="text-xs text-foreground">Loaded: {fileName}</p> : (
                    <p className="text-xs text-muted-foreground">PDF, DOCX, or plain text. Max 3 MB.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-role">Target Role (Optional)</Label>
                  <Input
                    id="target-role"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Graduate Software Engineer"
                  />
                </div>
                <Button onClick={() => void runReview()} disabled={isReviewing || cvWordCount < 40} className="w-full">
                  {isReviewing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reviewing…</> : <><Sparkles className="mr-2 h-4 w-4" />Review and Score</>}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CV Score</CardTitle>
                <CardDescription>Your latest CV rating out of 10.</CardDescription>
              </CardHeader>
              <CardContent>
                {review ? (
                  <div>
                    <p className="text-5xl font-semibold tracking-tight">
                      {review.score.toFixed(1)}<span className="text-lg text-muted-foreground">/10</span>
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">{review.summary}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                    Run a review to see your score here.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>CV Content</CardTitle><CardDescription>Edit in-app before rerunning.</CardDescription></CardHeader>
            <CardContent>
              <Textarea value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder="Paste your CV text here." className="min-h-[240px]" />
              <p className="mt-2 text-xs text-muted-foreground">{cvWordCount} words</p>
            </CardContent>
          </Card>

          {review && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Strengths</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {review.strengths.map((item, i) => (
                      <li key={i} className="rounded-md border bg-surface px-3 py-2">{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">What To Improve</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {review.improvements.map((item, i) => (
                      <li key={i} className="rounded-md border bg-surface px-3 py-2">{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {review?.sectionReviews.length ? (
            <Card>
              <CardHeader><CardTitle>Section Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {review.sectionReviews.map((item, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{item.section}</p>
                      <p className="text-sm text-muted-foreground">{item.score.toFixed(1)}/10</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {!review && rawReply && (
            <Card className="border-amber-500/40">
              <CardHeader><CardTitle className="text-base">Raw Output</CardTitle></CardHeader>
              <CardContent>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{rawReply}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 2: Job Matcher ────────────────────────────────────────────── */}
        <TabsContent value="job-match" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {CvUploadCard}
            <Card>
              <CardHeader>
                <CardTitle>Job Description</CardTitle>
                <CardDescription>Paste the full job posting to check your CV against it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the job description here…"
                  className="min-h-[180px]"
                />
                <Button onClick={() => void runJobMatch()} disabled={isMatching || cvWordCount < 40 || jobDescription.trim().length < 50} className="w-full">
                  {isMatching ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Matching…</> : <><Sparkles className="mr-2 h-4 w-4" />Check Match</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          {jobMatch && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>ATS Score</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-5xl font-semibold tracking-tight">
                      {(jobMatch.atsScore ?? 0).toFixed(1)}<span className="text-lg text-muted-foreground">/10</span>
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">{jobMatch.summary}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Suggestions</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {(jobMatch.suggestions ?? []).map((s, i) => (
                        <li key={i} className="rounded-md border bg-surface px-3 py-2">{s}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base text-green-600 dark:text-green-400">Matched Keywords</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {(jobMatch.matchedKeywords ?? []).map((kw, i) => (
                        <span key={i} className="rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-700 dark:text-green-300">{kw}</span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base text-red-600 dark:text-red-400">Missing Keywords</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {(jobMatch.missingKeywords ?? []).map((kw, i) => (
                        <span key={i} className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-700 dark:text-red-300">{kw}</span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Tab 3: Cover Letter ───────────────────────────────────────────── */}
        <TabsContent value="cover-letter" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {CvUploadCard}
            <Card>
              <CardHeader>
                <CardTitle>Job Description</CardTitle>
                <CardDescription>Paste the role you are applying for.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={coverJd}
                  onChange={(e) => setCoverJd(e.target.value)}
                  placeholder="Paste the job description here…"
                  className="min-h-[180px]"
                />
                <Button onClick={() => void runCoverLetter()} disabled={isGeneratingCover || cvWordCount < 40 || coverJd.trim().length < 50} className="w-full">
                  {isGeneratingCover ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</> : <><Wand2 className="mr-2 h-4 w-4" />Generate Cover Letter</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          {coverLetter && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Cover Letter</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(coverLetter); toast.success("Copied to clipboard."); }}>
                    <ClipboardCopy className="mr-1.5 h-4 w-4" />Copy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} className="min-h-[360px] font-mono text-sm" />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 4: Rewrite Section ────────────────────────────────────────── */}
        <TabsContent value="rewrite" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {CvUploadCard}
            <Card>
              <CardHeader>
                <CardTitle>Section to Rewrite</CardTitle>
                <CardDescription>Name the section and paste its current text.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="section-name">Section Name</Label>
                  <Input
                    id="section-name"
                    value={sectionName}
                    onChange={(e) => setSectionName(e.target.value)}
                    placeholder="e.g. Work Experience, Summary, Skills"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="section-text">Section Text</Label>
                  <Textarea
                    id="section-text"
                    value={sectionText}
                    onChange={(e) => setSectionText(e.target.value)}
                    placeholder="Paste the section you want improved…"
                    className="min-h-[120px]"
                  />
                </div>
                <Button onClick={() => void runRewrite()} disabled={isRewriting || sectionText.trim().length < 30} className="w-full">
                  {isRewriting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rewriting…</> : <><Wand2 className="mr-2 h-4 w-4" />Rewrite Section</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          {rewritten && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Rewritten Section</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(rewritten); toast.success("Copied to clipboard."); }}>
                    <ClipboardCopy className="mr-1.5 h-4 w-4" />Copy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea value={rewritten} onChange={(e) => setRewritten(e.target.value)} className="min-h-[200px] font-mono text-sm" />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab 5: Skills & Personal Statement ───────────────────────────── */}
        <TabsContent value="skills" className="space-y-4">
          {CvUploadCard}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Transferable skills */}
            <Card>
              <CardHeader>
                <CardTitle>Transferable Skills</CardTitle>
                <CardDescription>
                  Uncovers hidden skills from retail, sport, volunteering, and other non-traditional experience.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => void runTransferableSkills()} disabled={isExtractingSkills || cvWordCount < 40} className="w-full">
                  {isExtractingSkills ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Extracting…</> : <><Sparkles className="mr-2 h-4 w-4" />Extract Skills</>}
                </Button>
              </CardContent>
            </Card>

            {/* Personal statement */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Statement</CardTitle>
                <CardDescription>
                  Generates a university (UCAS) or graduate scheme personal statement from your CV.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="target-goal">Application Goal</Label>
                  <Input
                    id="target-goal"
                    value={targetGoal}
                    onChange={(e) => setTargetGoal(e.target.value)}
                    placeholder="e.g. Computer Science at University of Manchester"
                  />
                </div>
                <Button onClick={() => void runPersonalStatement()} disabled={isGeneratingStatement || cvWordCount < 40} className="w-full">
                  {isGeneratingStatement ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating…</> : <><Wand2 className="mr-2 h-4 w-4" />Write Statement</>}
                </Button>
              </CardContent>
            </Card>
          </div>

          {transferable && (
            <Card>
              <CardHeader><CardTitle>Your Transferable Skills</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(transferable.skills ?? []).map((s, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-1">
                    <p className="text-sm font-medium">{s.skill}</p>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Evidence:</span> {s.evidence}</p>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Why it matters:</span> {s.relevance}</p>
                  </div>
                ))}
                {transferable.summary && (
                  <p className="mt-2 text-sm text-muted-foreground border-t pt-3">{transferable.summary}</p>
                )}
              </CardContent>
            </Card>
          )}

          {personalStatement && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Personal Statement</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(personalStatement); toast.success("Copied to clipboard."); }}>
                    <ClipboardCopy className="mr-1.5 h-4 w-4" />Copy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea value={personalStatement} onChange={(e) => setPersonalStatement(e.target.value)} className="min-h-[360px] font-mono text-sm" />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
