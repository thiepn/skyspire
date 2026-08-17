import { chromium } from "playwright";
import fs from "node:fs/promises";

const outputDirectory = "screenshots";
await fs.mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage",
    "--no-sandbox"
  ]
});

const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1
});

const errors = [];
page.on("console", (message) => {
  const entry = `[browser:${message.type()}] ${message.text()}`;
  console.log(entry);
  if (message.type() === "error") errors.push(entry);
});
page.on("pageerror", (error) => {
  const entry = error.stack || error.message;
  console.error(entry);
  errors.push(entry);
});

try {
  await page.goto("http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
    timeout: 120_000
  });

  await page.waitForFunction(
    () => window.__VOID_CITY_READY__ === true || Boolean(window.__VOID_CITY_ERROR__),
    null,
    { timeout: 180_000 }
  );

  const bootstrapError = await page.evaluate(() => window.__VOID_CITY_ERROR__ ?? null);
  if (bootstrapError) throw new Error(`Game bootstrap failed: ${bootstrapError}`);

  await page.waitForFunction(
    () => document.querySelector("#loading")?.classList.contains("hidden"),
    null,
    { timeout: 30_000 }
  );

  await page.locator("#quality-select").selectOption("high");
  await page.locator("#tutorial-toggle").uncheck();
  await page.locator("#audio-enabled-toggle").uncheck();
  await page.locator("#start-button").click();

  await page.waitForFunction(
    () => !document.querySelector("#hud")?.classList.contains("hidden") && document.querySelector("#menu")?.classList.contains("hidden"),
    null,
    { timeout: 30_000 }
  );
  await page.waitForFunction(
    () => document.querySelector("#elapsed")?.textContent !== "00:00",
    null,
    { timeout: 30_000 }
  );

  const canvas = page.locator("#game-canvas");
  await canvas.focus();
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: `${outputDirectory}/void-city-v7-gameplay-01.png` });

  await page.keyboard.down("KeyW");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(4_200);
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(2_000);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: `${outputDirectory}/void-city-v7-gameplay-02.png` });

  await page.keyboard.down("KeyA");
  await page.waitForTimeout(2_000);
  await page.keyboard.up("KeyA");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(4_000);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${outputDirectory}/void-city-v7-gameplay-03.png` });

  const state = await page.evaluate(() => {
    const canvasElement = document.querySelector("#game-canvas");
    return {
      ready: window.__VOID_CITY_READY__ === true,
      version: window.__VOID_CITY_VERSION__ ?? null,
      loadingHidden: document.querySelector("#loading")?.classList.contains("hidden") ?? false,
      menuHidden: document.querySelector("#menu")?.classList.contains("hidden") ?? false,
      hudHidden: document.querySelector("#hud")?.classList.contains("hidden") ?? true,
      resultsHidden: document.querySelector("#results")?.classList.contains("hidden") ?? false,
      elapsed: document.querySelector("#elapsed")?.textContent ?? null,
      mass: document.querySelector("#mass")?.textContent ?? null,
      place: document.querySelector("#place")?.textContent ?? null,
      canvasWidth: canvasElement?.width ?? 0,
      canvasHeight: canvasElement?.height ?? 0
    };
  });

  await fs.writeFile(
    `${outputDirectory}/capture-report.json`,
    JSON.stringify({ state, errors }, null, 2)
  );

  if (!state.ready || !state.loadingHidden || !state.menuHidden || state.hudHidden || !state.resultsHidden || state.canvasWidth < 1000 || state.canvasHeight < 600) {
    throw new Error(`Gameplay state not reached: ${JSON.stringify(state)}`);
  }
} finally {
  await browser.close();
}
