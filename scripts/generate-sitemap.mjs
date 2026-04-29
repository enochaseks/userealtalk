import { writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://userealtalk.co.uk";
const OUTPUT_PATH = "./public/sitemap.xml";

const staticPages = [
  { path: "", changefreq: "daily", priority: "1.0" },
  { path: "/advice", changefreq: "daily", priority: "0.9" },
  { path: "/privacy", changefreq: "monthly", priority: "0.5" },
  { path: "/terms", changefreq: "monthly", priority: "0.5" },
  { path: "/refund-policy", changefreq: "monthly", priority: "0.5" },
];

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(".env");
loadDotEnv(".env.local");

async function fetchApprovedAdvicePosts() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    console.warn("[sitemap] Missing Supabase env vars, generating static-only sitemap.");
    return [];
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("advice_posts")
    .select("slug, created_at, updated_at")
    .eq("status", "approved")
    .not("slug", "is", null)
    .neq("slug", "")
    .order("updated_at", { ascending: false })
    .limit(50000);

  if (error) {
    console.warn(`[sitemap] Failed to fetch advice posts: ${error.message}`);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

async function generateSitemapXml() {
  const posts = await fetchApprovedAdvicePosts();
  const lines = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  for (const page of staticPages) {
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(`${BASE_URL}${page.path}`)}</loc>`);
    lines.push(`    <changefreq>${page.changefreq}</changefreq>`);
    lines.push(`    <priority>${page.priority}</priority>`);
    lines.push("  </url>");
  }

  for (const post of posts) {
    if (!post.slug) continue;
    const lastmod = toDateOnly(post.updated_at || post.created_at);

    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(`${BASE_URL}/advice/${encodeURIComponent(post.slug)}`)}</loc>`);
    if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push("    <changefreq>monthly</changefreq>");
    lines.push("    <priority>0.8</priority>");
    lines.push("  </url>");
  }

  lines.push("</urlset>");
  return `${lines.join("\n")}\n`;
}

const xml = await generateSitemapXml();
await writeFile(OUTPUT_PATH, xml, "utf8");
console.log(`[sitemap] Wrote ${OUTPUT_PATH}`);
