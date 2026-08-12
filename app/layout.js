import './globals.css';
import { AuthProvider } from '@/lib/useAuth';

export const metadata = {
  title: 'Portal QDC',
  description: 'Portal de Gestión de Personas — Química del Campo',
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
