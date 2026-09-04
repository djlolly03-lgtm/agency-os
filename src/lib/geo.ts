/**
 * Indian PIN code → city, by 3-digit prefix (postal circle). Deliberately
 * scoped to the prefixes actually seen in Organik Truck's order data
 * (checked against the client's pincode export) rather than a full
 * all-India table — a wrong guess on an unfamiliar prefix is worse than an
 * honest "Other", and this covers 100% of what's in the data as of the
 * Sep 2026 import.
 */
const PREFIX_CITY: Record<string, string> = {
  "400": "Mumbai", "401": "Mumbai (Thane/Palghar)", "421": "Thane / Navi Mumbai",
  "411": "Pune", "560": "Bengaluru", "700": "Kolkata", "122": "Gurugram",
  "600": "Chennai", "632": "Vellore", "396": "Valsad / Vapi", "570": "Mysuru",
  "201": "Ghaziabad / Noida", "711": "Howrah", "712": "Howrah", "250": "Meerut",
};

export function cityForPincode(pincode: string): string {
  return PREFIX_CITY[pincode.slice(0, 3)] ?? "Other";
}
