# Hilton Hospitality Seed Data for KIT

Complete dataset for the Hospitality domain covering Hilton Hotels & Resorts digital products.

## What's Included

| Entity | Count | Details |
|--------|-------|---------|
| **Domain** | 1 | Hospitality — with comprehensive knowledge docs covering all 17 Hilton brands, key systems (OnQ PMS, Hilton Honors, Digital Key, Connected Room), business domains, compliance standards, and integration points |
| **Projects** | 4 | Hilton.com Direct Booking, Hilton Honors Loyalty Platform, Group Sales & RFP Platform, Hilton Honors Mobile App |
| **Applications** | 11 | Web apps, APIs, and mobile apps across all projects |
| **Test Suites** | 13 | Smoke, sprint, regression, integration, E2E, and module test suites |
| **Test Cases** | 29 | Detailed test cases with steps, preconditions, and expected results |
| **Design Validations** | 4 | 3 new + 1 linked existing (Hilton Request Access portal) |

## Projects Breakdown

### 1. Hilton.com Direct Booking (HCOM)
- JIRA: https://jira.hilton.com/projects/HCOM
- Apps: Booking Engine (web), Search API, CMS (AEM)
- Suites: Booking Flow Smoke, Search Sprint 24.3, Booking Regression, Payment Integration
- BRD included with KPIs and success metrics

### 2. Hilton Honors Loyalty Platform (HHON)
- JIRA: https://jira.hilton.com/projects/HHON
- Apps: Member Portal (web), Points Engine API
- Suites: Points Accrual E2E, Tier Qualification Module, Member Portal Regression
- Test cases cover: point earning/redemption, tier upgrades/downgrades, airline transfers

### 3. Group Sales & RFP Platform (GSRFP)
- JIRA: https://jira.hilton.com/projects/GSRFP
- Apps: Request Access Portal (Salesforce), RFP Dashboard, Group Booking API
- Suites: Request Access E2E, RFP Workflow Smoke, Salesforce Integration
- Test cases include the Hilton Request Access form validation used in Design Validation

### 4. Hilton Honors Mobile App (HAPP)
- JIRA: https://jira.hilton.com/projects/HAPP
- Apps: iOS App, Android App, Mobile BFF API
- Suites: Digital Key Smoke, Mobile Check-in Sprint 24.4, Connected Room E2E
- Test cases cover: BLE room unlock, key sharing, elevator access, checkout revocation

## How to Import

```bash
psql $DATABASE_URL -f hilton_seed_data.sql
```

The SQL uses `ON CONFLICT ... DO UPDATE` so it's safe to re-run — existing rows will be updated, not duplicated.

## Key URLs

| Resource | URL |
|----------|-----|
| Request Access Portal (QA) | https://hilton--qa.sandbox.my.site.com/s/request-access |
| Figma Design File | https://www.figma.com/design/jl5gM84hdUjbyHo9lFpTUO/Hilton |
| Figma Prototype Password | Hilton@123KSG |

## Synthetic Test Data (for Design Validation)

Used by the journey executor when filling forms on the Request Access portal:

| Field | Value |
|-------|-------|
| First Name | Akhleaditya |
| Last Name | M |
| Email | sample@sample.com |
| Company | Sam's Hospitality LLC |
| Property | The Sam Houston |
| Job Title | Solution Lead |
