"use client";

import { createContext, useContext } from "react";
import { LEGACY_ROLE_INFO, type RoleInfo } from "@/lib/roles";

const RoleContext = createContext<RoleInfo>(LEGACY_ROLE_INFO);

/** Lets any client screen ask "what is this person allowed to do?" without another request. */
export function RoleProvider({ info, children }: { info: RoleInfo; children: React.ReactNode }) {
  return <RoleContext.Provider value={info}>{children}</RoleContext.Provider>;
}

export function useRoleInfo(): RoleInfo {
  return useContext(RoleContext);
}
