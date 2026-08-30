import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

// Applied to the document, not to any React Native view, so it covers the
// browser chrome behaviours that make a web page feel like a web page.
const globalCss = `
  html, body, #root {
    height: 100%;
    background-color: #ffffff;
  }
  body {
    /* Removes the rubber-band scroll and pull-to-refresh gestures, which
       read as broken inside a standalone home-screen app. */
    overscroll-behavior: none;
  }
  * {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }
  /* Mobile Safari zooms the viewport whenever a focused input renders below
     16px, and never zooms back out. A font-size floor is the fix; a
     maximum-scale viewport lock would also work but would disable pinch-zoom
     for everyone, which is an accessibility regression. */
  input, textarea, select {
    font-size: 16px;
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover is what makes env(safe-area-inset-*) resolve to
            non-zero values on a notched iPhone. Without it the app cannot
            know where the home indicator is. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>Sapako</title>

        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#ffffff" />

        {/* iOS ignores the manifest for home-screen installation and reads
            these instead. Without apple-mobile-web-app-capable, "Add to Home
            Screen" produces a bookmark that opens with Safari chrome
            visible, not a standalone app. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Sapako" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {
                    // A failed registration must never block the app: the
                    // service worker is a launch-speed optimisation, not a
                    // functional dependency.
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
