---
title: "KASTRA POS"
subtitle: "Super Admin Guide"
author: "KASTRA Technologies"
audience: "Platform operators running KASTRA as a service"
---

# Super Admin Guide

**This console is for running the KASTRA platform itself — not for running a shop.**
Everything here acts across tenants. Your customers never see it.

Signed in as super admin, you can change any business's plan, read any business's
audit log, reset any user's password, and delete a tenant outright. Treat that
accordingly.

---

## Contents

1. [Signing in](#1-signing-in)
2. [Dashboard](#2-dashboard)
3. [Businesses](#3-businesses)
4. [Gifting a plan](#4-gifting-a-plan)
5. [Users](#5-users)
6. [Analytics](#6-analytics)
7. [License keys](#7-license-keys)
8. [Referrals](#8-referrals)
9. [Affiliates](#9-affiliates)
10. [Webhooks](#10-webhooks)
11. [Support tools](#11-support-tools)
12. [Platform settings](#12-platform-settings)
13. [Audit and accountability](#13-audit-and-accountability)
14. [Health and incidents](#14-health-and-incidents)

---

## 1. Signing in

The console lives on its own host (port **3012** in development) and has a separate
login from the POS: `POST /api/v1/super-admin/login`.

There is **no super-admin row in the seed**. The account comes from environment
variables on the API:

- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_SECRET`

Your token lives in `sessionStorage`, so **closing the tab signs you out**. That is
deliberate — this console should not stay open on an unattended machine.

The API must have `ADMIN_URL` set to this console's origin, or CORS denies every
request silently.

## 2. Dashboard

Platform totals at a glance: businesses, revenue, signups, activity.

The sidebar carries a live status dot derived from real health data — queue depths
for email, webhooks and eTIMS, plus the eTIMS failure rate:

| Status | Means |
|---|---|
| **Operational** | Queues clear, no eTIMS failures |
| **Degraded** | Any queue above 10, or any eTIMS failure |
| **Incident** | Any queue above 50, or eTIMS failures above 20% |

The bell shows a platform alert feed. Critical alerts are flagged red, and alerts
tied to a specific business link straight to it.

Health and alerts refresh every 30 seconds.

## 3. Businesses

The tenant list — every business on the platform, its plan, status and trial state.

What you can do to a business:

| Action | Notes |
|---|---|
| **Change subscription** | Move a tenant between tiers |
| **Bulk update subscriptions** | Apply a change across many tenants at once |
| **Gift a plan** | Grant a tier without recording revenue — see below |
| **Cancel** | End the subscription |
| **Delete** | Removes the tenant. Irreversible |
| **Impersonate** | Sign in as that business to reproduce a problem |
| **View data** | Inspect the tenant's records |
| **Force update** | Push a client update to that tenant |
| **Audit log** | Everything that happened inside that business |

**On impersonation:** it exists so you can reproduce what a customer is reporting.
You are acting as them, with their access. It is recorded. Use it to diagnose, not to
do their data entry for them.

**On deletion:** deleting a business is not a soft delete you can undo from the UI.
Confirm you have the right tenant, and prefer **Cancel** when the customer might come
back.

## 4. Gifting a plan

Use this for partner accounts, internal use, pilots and goodwill — anywhere a tenant
should have a paid tier without paying.

Open the business, choose **Gift a plan**, then set:

- **Plan** — which tier to grant (defaults to Enterprise)
- **Reason** — why. Defaults to "Complimentary account"; replace it with something
  that will still make sense in a year, e.g. *"Partner account — pilot through Q4"*

The account is marked **comped**. That is the important part: **gifted accounts are
excluded from revenue**, so they do not inflate MRR or distort your analytics. The
modal states this on screen before you confirm.

Escape closes the dialog, Enter confirms.

> This replaced an older flow built on browser `prompt()` boxes, which could not show
> the tier, the price being waived, and the revenue exclusion at the same time.

## 5. Users

Cross-tenant user administration:

- **List all users** across the platform, or the users of one business
- **Reset a password**
- **Unlock** an account locked out by failed sign-ins
- **Update** a user
- **Delete** a user

Password reset and unlock are the two you will use daily — they are the most common
support request and the safest to action.

## 6. Analytics

Growth, churn and plan mix across the platform. Comped accounts are excluded from
revenue figures, so the numbers reflect actual money.

## 7. License keys

For desktop and offline deployments.

- **Issue** a key
- **Machine-bound key** — tied to a specific machine's derived hardware id, so it
  cannot be copied to another terminal
- **Revoke** a key
- **Resend** a key to the customer
- **Regenerate** a key

Machine-bound keys are the right default for desktop terminals. A plain key is
portable, which is convenient and also exactly what makes it leakable.

## 8. Referrals

The customer-to-customer referral programme: existing users bring in new businesses
and earn a reward. Review referrals and their payouts here.

Distinct from affiliates — see below.

## 9. Affiliates

External partners who promote KASTRA and earn **recurring commission**. Unlike
referrals, affiliates are not necessarily customers.

- Review and **approve or reject** applications
- Set the **commission percentage** per affiliate
- **Record a payout**

Affiliates sign in to their own portal (`/affiliate` on the web app) with a separate
token audience — an affiliate login is not a POS login and grants no tenant access.

These endpoints live outside the super-admin controller, under `/api/v1/affiliate/admin/*`.

## 10. Webhooks

Platform webhook endpoints and their delivery log. Toggle an endpoint on or off.
Payloads are HMAC-signed so receivers can verify them.

If the webhook queue depth is climbing on the dashboard, this is where you look.

## 11. Support tools

Diagnostics for handling a customer report: inspect a business's data, read its audit
log, and trigger a client force-update.

The usual sequence for "it is broken for this customer":

1. Check the alert feed and health for anything platform-wide
2. Open the business and read its audit log
3. Check `/api/v1/health/config` on the API for a blank credential — a missing key
   disables its feature silently rather than erroring
4. Impersonate only if you still cannot see it

## 12. Platform settings

Global configuration, plus an **IP whitelist** (add and remove entries) for
restricting access.

## 13. Audit and accountability

Two separate logs, and the distinction matters:

- **Business audit log** — what happened inside one tenant
- **Super-admin audit log** — what *you and other operators* did across tenants

Both are tamper-evident. Every consequential action in this console is recorded:
plan changes, gifts, impersonations, password resets, deletions.

## 14. Health and incidents

The console surfaces live queue depths (email, webhooks, eTIMS) and the eTIMS failure
rate.

What backing queues usually mean:

| Symptom | Usual cause |
|---|---|
| **Email queue climbing** | Resend key missing, invalid, or rate-limited |
| **Webhook queue climbing** | A customer endpoint is down and deliveries are retrying |
| **eTIMS queue climbing** | KRA unreachable, or a tenant's credentials expired |
| **eTIMS failure rate above 20%** | Treat as an incident — sales are not reaching KRA |

Redis backs these queues. **If `REDIS_HOST` is unset, jobs run synchronously with no
retry** — queue depths will read zero because there is no queue, not because
everything is healthy.

---

*Server installation and maintenance is in the **Admin & Installation Guide**.
Day-to-day POS operation is in the **User Guide**.*
