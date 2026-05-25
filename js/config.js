/**
 * BusCo Admin Dashboard — Configuration
 * ──────────────────────────────────────
 * Supabase credentials and global constants.
 * Replace ANON_KEY with your regenerated key after the security incident.
 */

export const CONFIG = {
  SUPABASE_URL: "https://kcdpfvatrwskpdghkxaz.supabase.co",
  ANON_KEY:     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjZHBmdmF0cndza3BkZ2hreGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MDQwODUsImV4cCI6MjA4NzM4MDA4NX0.3c2vpocuM-yL-gyeI4MiijWcFXJ1nsDAnsczoCzpBCQ",  // ← replace after regenerating
  API_BASE:     "https://kcdpfvatrwskpdghkxaz.supabase.co/rest/v1",

  // Default pagination
  PAGE_SIZE: 50,

  // App metadata
  APP_NAME:    "BusCo",
  APP_TAGLINE: "Transport Management System",
  VERSION:     "2.5.0",
};

export const ROUTES = [
  { id: "dashboard",    label: "Dashboard",      icon: "◈",  group: "overview"  },
  { id: "analytics",   label: "Analytics",      icon: "∿",  group: "overview"  },
  { id: "profile",      label: "My Profile",     icon: "⊛",  group: "overview"  },
  { id: "users",        label: "Users",           icon: "⊙",  group: "people"    },
  { id: "cards",        label: "Cards",           icon: "▭",  group: "people"    },
  { id: "wallets",      label: "Wallets",         icon: "◎",  group: "people"    },
  { id: "drivers",      label: "Drivers",         icon: "◉",  group: "people"    },
  { id: "buses",        label: "Buses",           icon: "▷",  group: "fleet"     },
  { id: "trips",        label: "Trips",           icon: "⌖",  group: "fleet"     },
  { id: "stations",     label: "Stations",        icon: "⊕",  group: "fleet"     },
  { id: "transactions", label: "Transactions",    icon: "⇄",  group: "finance"   },
  { id: "recharge",     label: "Recharges",       icon: "⊞",  group: "finance"   },
  { id: "transfers",    label: "Transfers",       icon: "⇋",  group: "finance"   },
  { id: "incidents",    label: "Incidents",       icon: "△",  group: "ops"       },
  { id: "logs",         label: "Logs",            icon: "≡",  group: "ops"       },
  { id: "admins",       label: "Admins",          icon: "⊛",  group: "ops"       },
];

export const NAV_GROUPS = {
  overview: "Overview",
  people:   "People",
  fleet:    "Fleet",
  finance:  "Finance",
  ops:      "Operations",
};
