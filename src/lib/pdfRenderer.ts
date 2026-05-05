import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

let kanitCssPromise: Promise<string> | null = null;

function getChromePath() {
  const configuredPath = process.env.CHROME_PATH || process.env.PDF_CHROME_PATH;
  if (configuredPath) return configuredPath;

  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    return candidates[0];
  }

  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }

  return "google-chrome";
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveChromePath() {
  const configuredPath = getChromePath();
  if (path.isAbsolute(configuredPath) && await fileExists(configuredPath)) {
    return configuredPath;
  }

  if (process.platform === "win32") {
    const candidates = [
      configuredPath,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for (const candidate of candidates) {
      if (candidate && await fileExists(candidate)) return candidate;
    }
  }

  return configuredPath;
}

async function loadKanitFontCss() {
  const cssUrl = "https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&display=swap";
  const cssResponse = await fetch(cssUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 Chrome PDF Renderer",
    },
  });
  if (!cssResponse.ok) throw new Error(`Failed to load Kanit CSS: ${cssResponse.status}`);

  const css = await cssResponse.text();
  const fontUrls = Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)).map((match) => match[1]);
  const uniqueUrls = Array.from(new Set(fontUrls));
  const replacements = new Map<string, string>();

  await Promise.all(uniqueUrls.map(async (fontUrl) => {
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(`Failed to load Kanit font: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    replacements.set(fontUrl, `data:font/woff2;base64,${buffer.toString("base64")}`);
  }));

  return css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, (_match, fontUrl: string) => {
    return `url(${replacements.get(fontUrl) || fontUrl})`;
  });
}

async function getKanitFontCss() {
  kanitCssPromise ||= loadKanitFontCss().catch((error) => {
    kanitCssPromise = null;
    console.warn("Kanit font embedding failed; Chrome may fall back to system fonts:", error);
    return "";
  });
  return kanitCssPromise;
}

async function prepareHtml(html: string) {
  const fontCss = await getKanitFontCss();
  const printCss = `
    <style>
      ${fontCss}
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body, table, th, td, input, textarea, select, button {
        font-family: "Kanit", "Noto Sans Thai", "Tahoma", "Arial", sans-serif !important;
      }
    </style>
  `;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${printCss}</head>`);
  }

  return `${printCss}${html}`;
}

export async function renderHtmlToPdfBuffer(html: string, fileName = "report") {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pmc-report-"));
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "report";
  const htmlPath = path.join(tempDir, `${safeFileName}.html`);
  const pdfPath = path.join(tempDir, `${safeFileName}.pdf`);

  try {
    await fs.writeFile(htmlPath, await prepareHtml(html), "utf8");
    const chromePath = await resolveChromePath();
    const htmlUrl = pathToFileURL(htmlPath).href;

    await execFileAsync(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--print-to-pdf-no-header",
      `--print-to-pdf=${pdfPath}`,
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=1500",
      htmlUrl,
    ], { timeout: 60000, windowsHide: true });

    return await fs.readFile(pdfPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
