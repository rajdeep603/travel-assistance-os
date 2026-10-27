-- The quotation PDF sent with the Teams invite, in the same e-mail.
ALTER TABLE "LeadMeeting" ADD COLUMN "withQuotation" BOOLEAN NOT NULL DEFAULT false;
