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
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
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
        <span className="px-3 py-2 text-lg font-bold tracking-tight">커머스 백오피스</span>
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
        {isPending && (
          <div aria-hidden className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        )}
        {me && (
          <div className="flex items-center gap-3 px-3 py-2">
            <span
              aria-hidden
              className="bg-brand-weak text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold"
            >
              {me.name.slice(0, 1)}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-semibold">{me.name}</span>
              <span className="text-muted-foreground text-[13px] font-medium">
                {ROLE_LABEL[me.role]}
              </span>
            </div>
          </div>
        )}
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
