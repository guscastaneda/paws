/**
 * Paws on Longmeadow — Client Portal Worker
 * Serves the portal at client.pawsonlongmeadow.com
 *
 * Environment variables (set as secrets in Cloudflare dashboard):
 *   AIRTABLE_API_KEY  — Airtable Personal Access Token
 */

// ── AIRTABLE CONFIG ──────────────────────────────────────────────────────────
const BASE_ID              = "appvQb876VInNJlnB";
const CLIENTS_TABLE        = "tblqksLnPLdE0nF8Q";
const PETS_TABLE           = "tbl6FYNs5D3LLxCdd";
const COMPLIANCE_TABLE     = "tblRuPAAVBeMjeWSa";
const PENDING_UPDATES_TABLE = "tblte5MYEXmlJ4FvF";

const FIELDS = {
  // Clients
  CLIENT_NAME:               "fld65O8M2r0KPgF9l",
  CLIENT_TOKEN:              "fld1wfRpBUKakmrXC",
  CLIENT_PETS:               "fldnqv9rshSaXcyg4",
  CLIENT_PHONE:              "fldrMb2on5Ah4XPGy",
  CLIENT_EMAIL:              "fldEiyeDye0XPbQhG",
  CLIENT_ADDRESS:            "fldtKuNB5rKnwfkBc",
  CLIENT_ADD_NAME:           "fldCMY9D0FMxsjXO1",
  CLIENT_ADD_PHONE:          "fldLaZn8rvz3980eW",
  CLIENT_ADD_EMAIL:          "fldObDDO77JkhdE4r",
  CLIENT_EMERGENCY_NAME:     "fldPtLY3f9x4A8Gvg",
  CLIENT_EMERGENCY_PHONE:    "fldT0hsGKW9uNcMO5",
  CLIENT_EMERGENCY_REL:      "fldNY55KtTdeF0QE7",
  CLIENT_AGREEMENT_SIGNED:   "fldBbIbLhv61zvhBa",
  CLIENT_AGREEMENT_DATE:     "fldEPvulUW1PnF8ur",
  CLIENT_EMAIL_CONFIRMED:    "fldu4QVk4SU9q6KOh",

  // Pets
  PET_NAME:   "fldcFRXue6vqhD1y8",
  PET_ACTIVE: "fldozhvZNn8G5t8MZ",
  PET_DOCS:   "fld1ySZtYttHQiwVa",

  // Compliance Documents
  DOC_TYPE:    "fld4i0GIKK6isMnhc",
  DOC_DATE:    "fldGwyiZcVRWrPgyE",
  DOC_EXPIRY:  "fld0ujeUQxBxRT73D",
  DOC_FILE:    "fldcif0z5lNqiW6mo",
  DOC_PET:     "fldNbMDIZOYbSMgKd",
  DOC_STATUS:  "fldjgTSMKIedLFVJh",
  DOC_EXPIRED: "fldPK1uooOqMOm0Bw",

  // Appointments
  APPT_SERVICE:    "fldUwAFOmprtGiJO1",
  APPT_CATEGORY:   "fldqRv3nVQT5s9uWi",
  APPT_PETS:       "fldwQvJRjq1HpOsPq",
  APPT_CLIENT:     "fldCGBunq3pwM75sw",
  APPT_START_DATE: "flddYyqOcOMXXlRmQ",
  APPT_START_TIME: "fldzh9OPPktIdyK5j",
  APPT_END_DATE:   "fldxdh9mYKL7aOaTV",
  APPT_END_TIME:   "fldX6VYq3LeqtNzHj",
  APPT_TRANSPORT:  "fldfuZ43EQtPDwfhh",
  APPT_NOTES:      "fldLEZa7Wtkyp5Zzr",
  APPT_STATUS:     "fldW123UTCTu1xjCe",
  APPT_MSG:        "fldYCBKRnM20ogYtm",

  // Pending Updates
  PU_CLIENT:     "flds9YOzTvMc2RJTR",
  PU_SUBMITTED:  "fld73j2wvAS2EMx9D",
  PU_STATUS:     "fldrrXbH3ZbYXL4zD",
  PU_FIELD:      "fldqCPoWFx10EmDti",
  PU_CURRENT:    "fldu7tMvfL47261Vp",
  PU_NEW:        "fldzmXieCp1eM50Um",
  PU_NOTES:      "fldl4Gvd9SGCARBya",
};

const AT = "https://api.airtable.com/v0/" + BASE_ID;
const BOARDING_SERVICE_ID = "recToZsYSMELIVcMN";
const APPOINTMENTS_TABLE  = "tbl9BGXYbTXh2Gwv1";

export { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT };
