import type { NotificationService } from "./types";

/**
 * Demo NotificationService: records events to the server log. A production
 * implementation (email/SMS/queue) would implement the same interface.
 */
class LogNotificationService implements NotificationService {
  async notify(event: {
    kind: "CASE_CREATED" | "APPOINTMENT_BOOKED" | "CLAIM_UPDATED" | "HANDOFF";
    subject: string;
    body: string;
  }): Promise<void> {
    console.info(`[notify:${event.kind}] ${event.subject} — ${event.body}`);
  }
}

let instance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!instance) instance = new LogNotificationService();
  return instance;
}
