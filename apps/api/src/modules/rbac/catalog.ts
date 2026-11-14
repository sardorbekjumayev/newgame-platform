/** Permission katalogi va tizim rollari — yagona manba (seed shu yerdan o'qiydi). */
export const PERMISSIONS = [
  'platform.applications.manage', // klub arizalarini ko'rish va holatini o'zgartirish
  'platform.clubs.manage', // klub (filial) + operator akkauntini yaratish, bloklash, parol tiklash
  'platform.managers.manage', // menejer akkauntlarini yaratish, bloklash, parol tiklash
  'operator.dashboard', // o'z klubi paneli
  'manager.dashboard', // biriktirilgan klublarni kuzatish
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleCode = 'SUPER_ADMIN' | 'OPERATOR' | 'MANAGER' | 'CUSTOMER';

export const SYSTEM_ROLES: { code: RoleCode; name: string; scope_type: 'PLATFORM' | 'CLUB' | 'BRANCH'; permissions: readonly Permission[] }[] = [
  { code: 'SUPER_ADMIN', name: 'Super Admin', scope_type: 'PLATFORM', permissions: ['platform.applications.manage', 'platform.clubs.manage', 'platform.managers.manage'] },
  // Operator — bitta klub (filial) ga bog'langan: user_roles.club_id
  { code: 'OPERATOR', name: 'Operator', scope_type: 'CLUB', permissions: ['operator.dashboard'] },
  // Menejer — klublar manager_clubs orqali (operator User ID si bilan) biriktiriladi
  { code: 'MANAGER', name: 'Manager', scope_type: 'PLATFORM', permissions: ['manager.dashboard'] },
  { code: 'CUSTOMER', name: 'Customer', scope_type: 'PLATFORM', permissions: [] },
];
