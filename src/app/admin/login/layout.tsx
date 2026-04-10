'use client';

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  // Login page uses a plain layout without the admin sidebar
  return <>{children}</>;
}
