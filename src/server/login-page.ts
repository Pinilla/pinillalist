import { html } from "hono/html";

/** The login page. It's plain HTML so it works before the app's scripts are allowed to load. */
export function loginPage(opts: { error?: string; needsSetup?: boolean }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#1e6b4f">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>Log in · pinillalist</title>
<style>
  :root { color-scheme: light dark; --bg: #eef2ef; --fg: #1d2420; --muted: #5d665f; --card: #fff; --accent: #1e6b4f; --border: #d9d6cc; --danger: #a33a2b; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151a17; --fg: #e8ebe6; --muted: #a2aba4; --card: #1f2622; --accent: #6fbf95; --border: #334039; --danger: #f08a7a; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 17px/1.4 system-ui, -apple-system, sans-serif; padding: 16px; }
  form { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  p { margin: 0 0 16px; color: var(--muted); }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  input { width: 100%; font: inherit; padding: 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); color: var(--fg); }
  button { width: 100%; margin-top: 16px; font: inherit; font-weight: 600; padding: 12px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; }
  .error { color: var(--danger); margin: 12px 0 0; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>pinillalist</h1>
  ${opts.needsSetup
    ? html`<p>No household password is set yet. On server1, run <code>npm run set-password</code> in the app folder.</p>`
    : html`<p>Enter the household password.</p>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  <button type="submit">Log in</button>`}
  ${opts.error ? html`<p class="error" role="alert">${opts.error}</p>` : ""}
</form>
</body>
</html>`;
}
