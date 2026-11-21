'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSessionMe } from '@/entities/session';
import { LogoutButton } from '@/features/auth-logout';
import { ROLE_LABEL } from '@/shared/lib/role-label';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/ui/sidebar';
import { visibleMenu } from '../lib/menu';

function SidebarSkeleton() {
  return (
    <div data-testid="sidebar-skeleton" className="flex flex-col gap-2 p-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: me, isPending } = useSessionMe();

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 text-base font-bold">커머스 백오피스</span>
      </SidebarHeader>
      <SidebarContent>
        {isPending || !me ? (
          <SidebarSkeleton />
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMenu(me.role).map(({ href, label, icon: Icon, comingSoon }) => (
                  <SidebarMenuItem key={href}>
                    {comingSoon ? (
                      <SidebarMenuButton asChild className="opacity-60">
                        <span aria-disabled="true">
                          <Icon />
                          <span>{label}</span>
                          <Badge variant="secondary" className="ml-auto">
                            준비 중
                          </Badge>
                        </span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton asChild isActive={pathname.startsWith(href)}>
                        <Link href={href}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        {me && (
          <div className="flex items-center gap-2 px-2">
            <span className="truncate text-sm font-semibold">{me.name}</span>
            <Badge variant="outline">{ROLE_LABEL[me.role]}</Badge>
          </div>
        )}
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
