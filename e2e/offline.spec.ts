import { expect, test, type Page } from "@playwright/test";

// The production build has no Supabase environment variables, so the app
// runs in its local-only mode; that is the offline-first surface this spec
// covers. Cloud sync is covered by the vitest sync suite and the pgTAP
// database tests.

async function waitForServiceWorker(page: Page) {
  // workbox's generated service worker calls clientsClaim(), so the page has
  // a controller as soon as precaching finished.
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 30_000 },
  );
}

test("offline PWA lifecycle keeps local todos durable across reloads", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const input = page.getByLabel("Add a task");
  await expect(input).toBeVisible();
  await waitForServiceWorker(page);

  await input.fill("Offline persistence check");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Offline persistence check")).toBeVisible();

  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name),
  );
  expect(databases).toContain("todo-pop");

  await context.setOffline(true);
  await page.reload();
  await expect(input).toBeVisible();
  await expect(page.getByText("Offline persistence check")).toBeVisible();

  await input.fill("Added while offline");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Added while offline")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("Offline persistence check")).toBeVisible();
  await expect(page.getByText("Added while offline")).toBeVisible();

  await page.reload();
  await expect(input).toBeVisible();
  await expect(page.getByText("Offline persistence check")).toBeVisible();
  await expect(page.getByText("Added while offline")).toBeVisible();
});

test("the service worker fallback serves the app shell for direct navigations", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Add a task")).toBeVisible();
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  // A deep navigation while offline must fall back to the cached shell
  // instead of a browser error page.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Add a task")).toBeVisible();
});
