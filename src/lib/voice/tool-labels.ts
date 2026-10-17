// What each voice-agent tool does, for people watching a call: a sentence for
// the agent activity panel and a short chip label for the live call board.

const LABELS: Record<string, [activity: string, chip: string]> = {
  search_providers: ["Searching the provider network", "Provider search"],
  book_appointment: ["Booking the appointment", "Booking"],
  confirm_appointment: ["Confirming the appointment", "Appointment confirmed"],
  cancel_appointment: ["Cancelling the appointment", "Appointment cancelled"],
  create_case: ["Opening an assistance case", "Case opened"],
  add_case_note: ["Adding a note to the case", "Case note"],
  get_case_status: ["Looking up the case", "Case lookup"],
  find_my_case: ["Finding the caller's case", "Case lookup"],
  get_claim_status: ["Looking up the claim", "Claim lookup"],
  check_coverage: ["Checking the policy coverage", "Coverage check"],
  search_knowledge: ["Checking the knowledge base", "Knowledge base"],
  record_hospital_update: ["Recording the hospital's update", "Hospital update"],
  record_followup: ["Recording the follow-up", "Follow-up"],
  send_upload_link: ["Sending a secure upload link", "Upload link sent"],
  confirm_log_receipt: ["Confirming the Letter of Guarantee arrived", "Letter confirmed"],
  find_guarantee: ["Finding the guarantee of payment", "Guarantee lookup"],
  resend_guarantee: ["Re-sending the guarantee to the hospital", "Guarantee re-sent"],
  request_guarantee_increase: ["Recording the request to raise the guarantee", "Top-up requested"],
  record_bill_agreement: ["Recording the hospital's answer on the bill", "Bill agreement"],
  record_transport_assessment: ["Planning the medical transport home", "Transport plan"],
  lookup_case: ["Looking up the case", "Case lookup"],
  search_records: ["Searching the records", "Record search"],
  find_providers: ["Finding providers", "Provider search"],
  open_record: ["Opening it on screen", "Opened on screen"],
  transfer_to_human: ["Handing over to a person", "Handover"],
  end_call: ["Ending the call", "Call ended"],
};

const fallback = (name: string) => {
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "check_coverage" → "Checking the policy coverage". */
export function toolActivityLabel(name: string): string {
  return LABELS[name]?.[0] ?? fallback(name);
}

/** "check_coverage" → "Coverage check". */
export function toolChipLabel(name: string): string {
  return LABELS[name]?.[1] ?? fallback(name);
}
