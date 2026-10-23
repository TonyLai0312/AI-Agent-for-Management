import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'EVOX Prospect Copilot',description:'Human-led prospect research and outreach workspace for an EMBA assignment.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
