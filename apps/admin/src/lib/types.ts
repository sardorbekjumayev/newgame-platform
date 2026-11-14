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

export type PlatformStats = { applications_new: number; applications_open: number; clubs: number; clubs_active: number; managers: number; operators: number; removals_pending: number; clubs_no_location: number };

export type OperatorDashboard = {
  me: Person;
  club: {
    id: string; name: string; city: string; address: string | null; phone: string | null; status: string; created_at: string;
    latitude: number | null; longitude: number | null; location_set_at: string | null; needs_location: boolean;
  };
  managers: (Person & { linked_at: string; removal_request: { id: string; reason: string | null; created_at: string } | null })[];
  link_requests: { id: string; code: string; expires_at: string; created_at: string; manager: Person }[];
};

export type LinkRequest = { id: string; expires_at: string; created_at: string; attempts: number };

export type ManagerClub = {
  id: string; name: string; city: string; address: string | null; phone: string | null; status: "ACTIVE" | "SUSPENDED"; created_at: string; linked_at: string;
  zones: { id: string; name: string; color: string | null }[]; tariffs_count: number; is_open_now: boolean | null;
  operator: (Person & { status: string; last_login_at: string | null }) | null;
};

export type RemovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type Contact = StaffUser & { email: string | null };
export type RemovalRequest = {
  id: string; status: RemovalStatus; reason: string | null; admin_note: string | null; created_at: string; handled_at: string | null;
  club: { id: string; name: string; city: string; address: string | null; phone: string | null };
  manager: Contact | null; operator: Contact | null; handler: Contact | null;
};

export type Zone = { id: string; name: string; description: string | null; color: string | null; sort_order: number; created_at: string; tariffs_count: number };
export type TariffType = "HOURLY" | "PACKAGE";
export type Tariff = {
  id: string; zone_id: string; name: string; type: TariffType; price: number; duration_minutes: number | null;
  valid_from: string | null; valid_to: string | null; is_active: boolean; sort_order: number; created_at: string;
};
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type WorkingHours = { always_open: boolean } & Record<DayKey, { open: string; close: string }[]>;

export type ManagerClubDetail = Omit<ManagerClub, "zones" | "tariffs_count"> & {
  latitude: number | null; longitude: number | null; working_hours: WorkingHours | null;
  zones: (Omit<Zone, "sort_order" | "created_at" | "tariffs_count"> & { tariffs: Omit<Tariff, "zone_id" | "sort_order" | "created_at">[] })[];
};
