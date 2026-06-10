import { expect, test } from '@jupyterlab/galata';

/**
 * Don't load JupyterLab webpage before running the tests.
 * This is required to ensure we capture all log messages.
 */
test.use({ autoGoto: false });

test('should emit an activation console message', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', message => {
    logs.push(message.text());
  });

  await page.goto();

  expect(
    logs.filter(
      s =>
        s ===
        'JupyterLab Math Notebook Tools activated: jupyterlab_math_notebook_tools:plugin'
    )
  ).toHaveLength(1);
});

test('should open rendered notebook search command UI', async ({ page }) => {
  await page.goto();

  await page.evaluate(async () => {
    await window.jupyterapp.commands.execute(
      'math-notebook-tools:rendered-search'
    );
  });

  await expect(page.locator('.mnt-RenderedSearch')).toBeVisible();
  await expect(page.locator('.mnt-RenderedSearch-input')).toBeFocused();
});
