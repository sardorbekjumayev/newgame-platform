export type Person = { id: string; public_id: string | null; username: string | null; first_name: string | null; last_name: string | null };
export type StaffUser = Person & { phone: string | null; status: "ACTIVE" | "BLOCKED"; last_login_at: string | null; must_change_password: boolean; created_at: string };

export type ApplicationStatus = "NEW" | "CONTACTED" | "APPROVED" | "REJECTED";
export type Application = {
  id: string; full_name: string; phone: string; club_name: string; city: string | null; address: string | null;
  devices_count: number | null; branches_count: number | null; telegram: string | null; comment: string | null;
  language: string; status: ApplicationStatus; admin_note: string | null; handled_at: string | null; created_at: string;
  clubs?: { id: string; name: string; status: string }[];
};

export type Club = {
  id: string; name: string; city: string; address: string | null; phone: string | null; status: "ACTIVE" | "SUSPENDED";
  application_id: string | null; created_at: string; managers_count: number; operator: StaffUser | null;
  latitude: number | null; longitude: number | null;
};
export type ClubLocation = { latitude: number | null; longitude: number | null; location_set_at: string | null };
export type ClubDetail = Omit<Club, "managers_count"> & ClubLocation & {
  working_hours: WorkingHours | null;
  is_open_now: boolean | null;
  zones: ManagerClubDetail["zones"];
} & { managers: (StaffUser & { linked_at: string })[] };

export type Manager = StaffUser & { clubs: { id: string; name: string; city: string }[] };

export type PlatformStats = { applications_new: number; applications_open: number; clubs: number; clubs_active: number; managers: number; operators: number; removals_pending: number; subscription_alerts: number; clubs_no_location: number };

export type Plan = { id: string; name: string; price: number; max_zones: number; max_devices: number; is_active: boolean; created_at: string; clubs_count?: number };
export type SubStatus = "TRIAL" | "ACTIVE" | "EXPIRING" | "EXPIRED";
export type ClubSubscription = { id: string; club_id: string; trial_days: number; starts_at: string; trial_ends_at: string; ends_at: string; note: string | null; created_at: string; plan: Plan; status: SubStatus; days_left: number };
export type SubscriptionRow = { id: string; name: string; city: string; address: string | null; status: "ACTIVE" | "SUSPENDED"; subscription: ClubSubscription | null; usage: { zones: number; devices: number } };
export type PlanUsage = { limits: { plan: string; max_zones: number; max_devices: number } | null; zones: number; devices: number };

export type OperatorDashboard = {
  me: Person;
  club: {
    id: string; name: string; city: string; address: string | null; phone: string | null; status: string; created_at: string;
    latitude: number | null; longitude: number | null; location_set_at: string | null; needs_location: boolean;
    /** Logotip va klub rasmi (webp, `/api/v1/media/...`); null — yuklanmagan */
    logo_url: string | null; photo_url: string | null;
  };
  managers: (Person & { phone: string | null; linked_at: string; removal_request: { id: string; reason: string | null; created_at: string; by_manager: boolean } | null })[];
  link_requests: { id: string; code: string; expires_at: string; created_at: string; manager: Person }[];
  subscription: ClubSubSummary | null;
};

export type LinkRequest = { id: string; expires_at: string; created_at: string; attempts: number };

export type ManagerClub = {
  id: string; name: string; city: string; address: string | null; phone: string | null; status: "ACTIVE" | "SUSPENDED"; created_at: string; linked_at: string;
  zones: { id: string; name: string; color: string | null; devices_count: number | null }[]; tariffs_count: number; is_open_now: boolean | null;
  operator: (Person & { status: string; last_login_at: string | null }) | null;
  pending_removal: { id: string; reason: string | null; created_at: string; by_me: boolean } | null;
  subscription: ClubSubSummary | null;
};

export type ClubSubSummary = { plan: { name: string; price: number; max_zones: number; max_devices: number }; status: "TRIAL" | "ACTIVE" | "EXPIRING" | "EXPIRED"; days_left: number; trial_ends_at: string; ends_at: string };

export type RemovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type Contact = StaffUser & { email: string | null };
export type RemovalRequest = {
  id: string; status: RemovalStatus; by_manager: boolean; reason: string | null; admin_note: string | null; created_at: string; handled_at: string | null;
  club: { id: string; name: string; city: string; address: string | null; phone: string | null; application_phone: string | null; application_telegram: string | null };
  manager: Contact | null; operator: Contact | null; handler: Contact | null;
};

export type Zone = { id: string; name: string; description: string | null; color: string | null; devices_count: number | null; layout?: import("@/components/zone-layout").ZoneLayout | null; sort_order: number; created_at: string; tariffs_count: number };
export type TariffType = "HOURLY" | "PACKAGE";
export type Tariff = {
  id: string; zone_id: string; name: string; type: TariffType; price: number; duration_minutes: number | null;
  valid_from: string | null; valid_to: string | null; is_active: boolean; sort_order: number; created_at: string;
};
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type WorkingHours = { always_open: boolean } & Record<DayKey, { open: string; close: string }[]>;

export type ManagerClubDetail = Omit<ManagerClub, "zones" | "tariffs_count" | "operator"> & {
  operator: (Person & { status: string; last_login_at: string | null; phone: string | null }) | null;
  latitude: number | null; longitude: number | null; working_hours: WorkingHours | null;
  zones: (Omit<Zone, "sort_order" | "created_at" | "tariffs_count"> & { tariffs: Omit<Tariff, "zone_id" | "sort_order" | "created_at">[] })[];
};

/** Super admin zaxira nusxasi: `id` bilan `GET /admin/backups/:id/download` (havola `expires_in` soniya amal qiladi). */
export type BackupResult = {
  id: string; file_name: string; size: number; kind: "full" | "period"; from: string | null; to: string | null;
  tables: number; rows: number; files: number; files_bytes: number; expires_in: number;
};
export type BackupInfo = {
  database_bytes: number; storage_files: number; storage_bytes: number; timezone: string;
  history: { id: string; at: string; actor: string | null; kind: "full" | "period"; from: string | null; to: string | null; size: number; rows: number; files: number }[];
};
