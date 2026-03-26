-- Create contact_imports table
CREATE TABLE "contact_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "referral_code" TEXT,
    "invited_at" TIMESTAMP(3),
    "registered_at" TIMESTAMP(3),
    "registered_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "contact_imports_registered_user_id_fkey" FOREIGN KEY ("registered_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
    CONSTRAINT "contact_imports_user_id_phone_key" UNIQUE("user_id", "phone")
);

-- Create contact_invitations table
CREATE TABLE "contact_invitations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "from_user_id" TEXT NOT NULL,
    "to_phone" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "referral_code" TEXT NOT NULL UNIQUE,
    "sent_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "registered_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_invitations_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "contact_invitations_registered_user_id_fkey" FOREIGN KEY ("registered_user_id") REFERENCES "users" ("id") ON DELETE SET NULL
);

-- Create referral_links table
CREATE TABLE "referral_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "from_user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_links_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX "contact_imports_user_id_idx" ON "contact_imports"("user_id");
CREATE INDEX "contact_imports_phone_idx" ON "contact_imports"("phone");
CREATE INDEX "contact_invitations_from_user_id_idx" ON "contact_invitations"("from_user_id");
CREATE INDEX "contact_invitations_to_phone_idx" ON "contact_invitations"("to_phone");
CREATE INDEX "contact_invitations_referral_code_idx" ON "contact_invitations"("referral_code");
CREATE INDEX "referral_links_code_idx" ON "referral_links"("code");
CREATE INDEX "referral_links_from_user_id_idx" ON "referral_links"("from_user_id");
