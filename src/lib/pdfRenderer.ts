import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

let thaiSarabunCssPromise: Promise<string> | null = null;

function shouldUseServerlessChromium() {
  return (
    process.env.PDF_USE_PUPPETEER === "true" ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.NETLIFY) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  );
}

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

async function loadThaiSarabunFontCss() {
  const fontDirectory = path.join(process.cwd(), "public", "fonts");
  const [regular, bold] = await Promise.all([
    fs.readFile(path.join(fontDirectory, "THSarabunNew.ttf")),
    fs.readFile(path.join(fontDirectory, "THSarabunNew-Bold.ttf")),
  ]);
  return `
    @font-face {
      font-family: "TH Sarabun New";
      src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype");
      font-style: normal;
      font-weight: 400;
    }
    @font-face {
      font-family: "TH Sarabun New";
      src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype");
      font-style: normal;
      font-weight: 600 900;
    }
  `;
}

async function getThaiSarabunFontCss() {
  thaiSarabunCssPromise ||= loadThaiSarabunFontCss().catch((error) => {
    thaiSarabunCssPromise = null;
    console.warn("TH Sarabun New embedding failed; Chrome may fall back to system fonts:", error);
    return "";
  });
  return thaiSarabunCssPromise;
}

async function prepareHtml(html: string) {
  const fontCss = await getThaiSarabunFontCss();
  const printCss = `
    <style>
      ${fontCss}
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body, table, th, td, input, textarea, select, button {
        font-family: "TH Sarabun New", "Sarabun", "Noto Sans Thai", "Tahoma", "Arial", sans-serif !important;
      }
    </style>
  `;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${printCss}</head>`);
  }

  return `${printCss}${html}`;
}

async function renderWithPuppeteer(html: string) {
  const [{ default: chromium }, puppeteer] = await Promise.all([
    import("@sparticuz/chromium"),
    import("puppeteer-core"),
  ]);

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--disable-web-security",
        "--font-render-hinting=medium",
      ],
      defaultViewport: { width: 1600, height: 2000, deviceScaleFactor: 1 },
      executablePath: await chromium.executablePath(),
      headless: true,
      protocolTimeout: 120000,
    });

    const page = await browser.newPage();
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      for (const image of Array.from(document.images)) {
        await image.decode().catch(() => undefined);
      }
    });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 120000,
    });

    return Buffer.from(pdf);
  } finally {
    await browser?.close().catch((error) => {
      console.warn("Failed to close PDF browser:", error);
    });
  }
}

export async function renderHtmlToPdfBuffer(html: string, fileName = "report") {
  const preparedHtml = await prepareHtml(html);

  if (shouldUseServerlessChromium()) {
    return await renderWithPuppeteer(preparedHtml);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pmc-report-"));
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "report";
  const htmlPath = path.join(tempDir, `${safeFileName}.html`);
  const pdfPath = path.join(tempDir, `${safeFileName}.pdf`);

  try {
    await fs.writeFile(htmlPath, preparedHtml, "utf8");
    const chromePath = await resolveChromePath();
    const htmlUrl = pathToFileURL(htmlPath).href;

    await execFileAsync(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--print-to-pdf-no-header",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=1500",
      "--force-device-scale-factor=2",
      htmlUrl,
    ], { timeout: 60000, windowsHide: true });

    return await fs.readFile(pdfPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
