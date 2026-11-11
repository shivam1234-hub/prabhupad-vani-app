import type React from 'react';

/** The desktop (Electron/web) UI. `null` on phones — see index.ts / index.web.ts. */
export interface DesktopUI {
  Shell: React.ComponentType<{ children: React.ReactNode }>;
  Home: React.ComponentType;
  Library: React.ComponentType;
  Search: React.ComponentType;
  Category: React.ComponentType;
  Lecture: React.ComponentType;
  Downloads: React.ComponentType;
  History: React.ComponentType;
  ByLength: React.ComponentType;
  Settings: React.ComponentType;
}
