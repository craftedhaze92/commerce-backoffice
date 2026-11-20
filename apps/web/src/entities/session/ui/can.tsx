'use client';

import type { ReactNode } from 'react';
import { can, type Permission } from '@bo/contracts';
import { useMe } from '../model/use-me';

interface CanProps {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}

/** 세션이 없거나 권한이 없으면 fallback을 그린다. */
export function Can({ permission, fallback = null, children }: CanProps) {
  const { data: me } = useMe();
  if (!me || !can(me.role, permission)) return <>{fallback}</>;
  return <>{children}</>;
}
