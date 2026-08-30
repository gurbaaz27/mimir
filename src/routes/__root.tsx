import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import { MimirMark } from '#/components/ui'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  notFoundComponent: () => (
    <main className="app-boot not-found-page">
      <MimirMark />
      <div className="not-found-copy">
        <strong>Page not found</strong>
        <p>That page doesn’t exist.</p>
        <Link to="/">Back to library</Link>
      </div>
    </main>
  ),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'mimir — where humans and ai study together',
      },
      {
        name: 'description',
        content:
          'A local-first PDF workspace for close reading and precise annotation, with your documents and marks exposed to browser agents over WebMCP.',
      },
      {
        name: 'theme-color',
        content: '#ffffff',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
      },
      {
        rel: 'apple-touch-icon',
        href: '/mimir-logo.png',
      },
      {
        rel: 'preload',
        href: '/fonts/OverusedGrotesk-VF.woff2',
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
