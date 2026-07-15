import { gstinStateCode, gstinStateName } from "@/lib/constants";

/**
 * Normalise a GST-registration input into the columns stored on the row,
 * deriving the state code and state name from the GSTIN. Pure — safe on
 * client or server.
 */
export function gstRegistrationData(input: {
  gstin: string;
  label?: string | null;
  address?: string | null;
  active?: boolean;
}) {
  const gstin = input.gstin.trim().toUpperCase();
  return {
    gstin,
    label: input.label?.trim() || null,
    address: input.address?.trim() || null,
    active: input.active ?? true,
    stateCode: gstinStateCode(gstin),
    state: gstinStateName(gstin),
  };
}
