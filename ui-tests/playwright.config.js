/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

module.exports = {
  ...baseConfig,
  webServer: {
    command:
      'powershell -NoProfile -Command "& $env:USERPROFILE\\anaconda3\\envs\\work\\python.exe -m jupyterlab --config jupyter_server_test_config.py"',
    url: 'http://localhost:8888/lab',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
