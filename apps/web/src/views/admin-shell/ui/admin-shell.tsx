'use client';

import type { ReactNode } from 'react';
import { AdminSidebar } from '@/widgets/admin-sidebar';
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset className="p-6">{children}</SidebarInset>
    </SidebarProvider>
  );
}
