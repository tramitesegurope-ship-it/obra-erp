-- Add Sunday absence penalty flag to employees
ALTER TABLE "Employee" ADD COLUMN "absenceSundayPenalty" BOOLEAN NOT NULL DEFAULT false;
