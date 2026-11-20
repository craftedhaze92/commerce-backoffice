import { LayoutDashboard, Package, ShoppingCart, Users, type LucideIcon } from 'lucide-react';
import { can, type Permission, type Role } from '@bo/contracts';

export interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  /** M2·M3 구현 전까지 "준비 중"으로 비활성 처리한다 */
  comingSoon?: boolean;
}

export const MENU: MenuItem[] = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard, permission: 'dashboard:read' },
  { href: '/products', label: '상품', icon: Package, permission: 'product:read', comingSoon: true },
  {
    href: '/orders',
    label: '주문',
    icon: ShoppingCart,
    permission: 'order:read',
    comingSoon: true,
  },
  { href: '/users', label: '사용자', icon: Users, permission: 'user:manage' },
];

export function visibleMenu(role: Role): typeof MENU {
  return MENU.filter((item) => can(role, item.permission));
}
