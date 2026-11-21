// Build-time Content Security Policy for every page.
// After `astro build`, hashes each page's final inline <script> (and, where needed, <style>)
// blocks and writes a CSP <meta> into the page, so the hashes always match what ships.
// The build fails if a page loads a third-party script, uses inline event handlers, or
// already has a CSP, since the policy would silently break the page in production.
// (`astro dev` is unaffected; it injects its own scripts.)
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// North Star and Glossary: self-contained pages; the only network destination is the GitHub
// API for sync. Styles stay 'unsafe-inline' because the apps render style="" attributes.
const APP = {
  "default-src": ["'none'"],
  "style-src": ["'unsafe-inline'"],
  "img-src": ["data:"],
  "connect-src": ["https://api.github.com"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
};
// Portfolio: its own files plus Google Fonts.
const SITE = {
  "default-src": ["'self'"],
  "style-src": ["'self'", "https://fonts.googleapis.com"],
  "font-src": ["https://fonts.gstatic.com"],
  "img-src": ["'self'", "data:"],
  "connect-src": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
};
const policyFor = (page) => (/^(northstar|glossary)\//.test(page) ? APP : SITE);

const JS_TYPES = new Set(["", "module", "text/javascript", "application/javascript"]);
const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1];
const sha256 = (s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

export function buildCsp(html, page) {
  const fail = (msg) => { throw new Error(`CSP: ${page}: ${msg}`); };
  if (/http-equiv\s*=\s*"Content-Security-Policy"/i.test(html)) fail("page already has a CSP <meta>");
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, ""); // tags only, no script bodies
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(markup)) fail("inline event handler (on...=) would be blocked");

  const isApp = policyFor(page) === APP;
  const policy = structuredClone(policyFor(page));
  const scripts = new Set();
  let needsSelf = false;
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!JS_TYPES.has((attr(attrs, "type") || "").toLowerCase())) continue; // data block, e.g. application/json
    const src = attr(attrs, "src");
    if (src === undefined) scripts.add(sha256(body));
    else if (/^([a-z]+:)?\/\//i.test(src)) fail(`third-party script ${src}`);
    else if (isApp) fail(`app pages must stay self-contained (script ${src})`);
    else needsSelf = true;
  }
  policy["script-src"] = [...(needsSelf ? ["'self'"] : []), ...scripts];
  if (!policy["script-src"].length) policy["script-src"] = ["'none'"];
  if (!policy["style-src"].includes("'unsafe-inline'")) {
    for (const [, body] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) policy["style-src"].push(sha256(body));
    if (/<[a-z][^>]*\sstyle\s*=/i.test(markup)) fail('style="" attribute would be blocked');
  }

  const content = Object.entries(policy).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${content}">`;
  const at = html.match(/<meta charset[^>]*>/i) || html.match(/<head[^>]*>/i);
  if (!at) fail("no <head>");
  const out = html.slice(0, at.index + at[0].length) + meta + html.slice(at.index + at[0].length);
  const firstScript = out.search(/<script\b/i);
  if (firstScript !== -1 && firstScript < out.indexOf(meta)) fail("a <script> comes before the CSP <meta>");
  return out;
}

async function* htmlFiles(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

export default function csp() {
  return {
    name: "build-time-csp",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        for await (const file of htmlFiles(root)) {
          const page = relative(root, file).split(sep).join("/");
          await writeFile(file, buildCsp(await readFile(file, "utf8"), page));
          logger.info(`CSP added to ${page}`);
        }
      },
    },
  };
}
