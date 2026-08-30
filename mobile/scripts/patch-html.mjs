// Fallback for when Expo's +html.tsx is not applied to the single-output
// index.html. Injects the document attributes and head tags the PWA needs
// directly into the emitted file. Deterministic and verifiable, unlike
// injecting them at runtime from JS.
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../dist/index.html', import.meta.url);
let html = readFileSync(path, 'utf8');

if (!html.includes('dir="rtl"')) {
  html = html.replace(/<html([^>]*)>/, '<html$1 lang="he" dir="rtl">');
}

const head = `
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <link rel="manifest" href="/manifest.webmanifest">
    <meta name="theme-color" content="#ffffff">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="Sapako">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
`;

if (!html.includes('apple-mobile-web-app-capable')) {
  html = html.replace('</head>', `${head}  </head>`);
}

// Drop any viewport tag Expo emitted without viewport-fit, so the one above wins.
html = html.replace(
  /<meta name="viewport" content="(?![^"]*viewport-fit)[^"]*">/g,
  '',
);

writeFileSync(path, html);
console.log('patched dist/index.html');
