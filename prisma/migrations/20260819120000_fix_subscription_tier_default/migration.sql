-- `subscriptionTier` defaulted to the string "TRIAL", which is a subscription
-- STATUS and not a tier at all. It matched no row in the tier/feature table, so
-- it resolved to FREE everywhere — meaning every business created since has been
-- treated as free, including customers who were mid-trial. That is why a trial
-- account saw a full sidebar next to dashboard tiles telling it to upgrade.
--
-- Access during a trial is decided by subscriptionStatus + trialEndsAt through
-- effectiveTier(), so the tier column can now default to what the customer has
-- actually paid for, and fails closed when nothing has been paid.
--
-- planName is a display label derived from the tier, so its default follows.

ALTER TABLE "Business" ALTER COLUMN "subscriptionTier" SET DEFAULT 'FREE';
ALTER TABLE "Business" ALTER COLUMN "planName"         SET DEFAULT 'Free';

-- Correct rows still carrying the invalid value. FREE is the safe landing spot:
-- anyone genuinely mid-trial keeps full access through their status and end date,
-- and anyone who is not gets no paid features they have not paid for.
UPDATE "Business"
   SET "subscriptionTier" = 'FREE',
       "planName"         = 'Free'
 WHERE upper("subscriptionTier") NOT IN ('FREE','STARTER','GROWTH','PRO','ENTERPRISE');
