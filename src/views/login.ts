import { CONFIG } from "../config.js";

const GOOGLE_ICON = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;

export function loginPageHtml(redirect?: string): string {
  const googleUrl = `/auth/google${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in — Quantum Marketing</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: #f8fafe;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
      border: 1px solid #e2e8f0;
      width: 100%;
      max-width: 400px;
      overflow: hidden;
    }
    .card-header {
      background: linear-gradient(135deg, #0086ff 0%, #0070d6 50%, #004d94 100%);
      padding: 32px 32px 28px;
      text-align: center;
      color: white;
    }
    .card-header h1 {
      font-size: 1.3rem;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .card-header p {
      font-size: 0.85rem;
      opacity: 0.85;
    }
    .card-body {
      padding: 32px;
    }
    .google-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 12px 24px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 100px;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      color: #3d4449;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }
    .google-btn:hover {
      border-color: #0086ff;
      box-shadow: 0 4px 12px rgba(0, 134, 255, 0.15);
      transform: translateY(-1px);
    }
    .google-btn svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    .domain-note {
      margin-top: 20px;
      text-align: center;
      font-size: 0.75rem;
      color: #5a6268;
    }
    .domain-note span {
      font-weight: 600;
      color: #0086ff;
    }
    .shield {
      width: 32px;
      height: 32px;
      margin: 0 auto 12px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <svg class="shield" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
      <h1>Quantum Gate</h1>
      <p>Sign in to access internal services</p>
    </div>
    <div class="card-body">
      <a href="${googleUrl}" class="google-btn">
        ${GOOGLE_ICON}
        Sign in with Google
      </a>
      <p class="domain-note">Only <span>@${CONFIG.ALLOWED_DOMAIN}</span> accounts are allowed</p>
    </div>
  </div>
</body>
</html>`;
}
