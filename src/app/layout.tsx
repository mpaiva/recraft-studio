import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clear Studio',
  description: 'Generate sets of SVG illustrations from a brief, with the palette and the cost up front.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
