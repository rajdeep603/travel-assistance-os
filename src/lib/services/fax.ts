// ---------------------------------------------------------------------------
// FaxService: outbound fax (Letters of Guarantee back to hospitals). Twilio
// retired Programmable Fax in 2021, so a real provider (e.g. Documo mFax,
// Fax.Plus) plugs in here as one class; until then the mock records faxes in
// the outbox and the whole flow — generate, send, confirm — still runs.
// ---------------------------------------------------------------------------

export interface FaxService {
  readonly name: string;
  readonly configured: boolean;
  send(to: string, pdf: Buffer, filename: string): Promise<{ id: string }>;
}

export class MockFax implements FaxService {
  readonly name = "mock";
  readonly configured = false;
  readonly sent: { to: string; filename: string; bytes: number }[] = [];

  async send(to: string, pdf: Buffer, filename: string) {
    this.sent.push({ to, filename, bytes: pdf.length });
    return { id: `mock_fax_${this.sent.length}` };
  }
}

let instance: FaxService | null = null;

export function getFaxService(): FaxService {
  // FAX_PROVIDER selects a real adapter once one is added; "mock" is the default.
  if (!instance) instance = new MockFax();
  return instance;
}

/** Test hook. */
export function setFaxService(service: FaxService | null): void {
  instance = service;
}
