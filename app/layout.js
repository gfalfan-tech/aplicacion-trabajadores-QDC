import './globals.css';
import { AuthProvider } from '@/lib/useAuth';

export const metadata = {
  title: 'Gestión RRHH',
  description: 'Portal de Gestión de Personas — Química del Campo',
  manifest: '/manifest.json',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
};

export const viewport = {
  themeColor: '#153A5B',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-slate-100">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
