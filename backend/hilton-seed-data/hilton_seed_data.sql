-- ============================================================
-- KIT Seed Data: Hilton Hospitality Domain
-- Complete dataset with Domain, Projects, Applications,
-- Test Suites, Test Cases, and Design Validations
-- ============================================================

-- Use fixed UUIDs so references are deterministic
-- Domain
-- Project IDs
-- Application IDs
-- Test Suite IDs

BEGIN;

-- ============================================================
-- 1. DOMAIN: Hospitality
-- ============================================================
INSERT INTO domains (id, name, description, knowledge_docs)
VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'Hospitality',
  'Hilton Hotels & Resorts — digital guest experience, property management, loyalty programs, and enterprise operations across global hotel brands including Hilton, DoubleTree, Hampton, Embassy Suites, Waldorf Astoria, and Conrad.',
  E'## Hilton Digital Platform Knowledge Base\n\n### Brand Portfolio\n- **Hilton Hotels & Resorts** — Full-service flagship brand\n- **DoubleTree by Hilton** — Upscale, warm cookie welcome\n- **Hampton by Hilton** — Mid-tier, value-focused\n- **Embassy Suites by Hilton** — All-suite, complimentary breakfast\n- **Waldorf Astoria** — Luxury tier\n- **Conrad Hotels** — Luxury lifestyle\n- **Canopy by Hilton** — Boutique lifestyle\n- **Curio Collection** — Independent hotels\n- **Tapestry Collection** — Upscale independent\n- **Tru by Hilton** — Midscale, younger demo\n- **Home2 Suites** — Extended stay\n- **Homewood Suites** — Extended stay, upscale\n- **Motto by Hilton** — Micro-hotel, urban\n- **Tempo by Hilton** — Lifestyle, premium\n- **Signia by Hilton** — Premier meetings/events\n- **LXR Hotels & Resorts** — Luxury collection\n- **Spark by Hilton** — Premium economy\n\n### Key Systems\n- **OnQ PMS** — Property Management System (check-in, housekeeping, billing)\n- **Hilton Honors** — Loyalty program (130M+ members)\n- **Digital Key** — Mobile room key via Hilton Honors app\n- **Connected Room** — IoT-enabled guest room controls\n- **Hilton.com** — Direct booking engine\n- **Salesforce CRM** — Group sales, RFP management\n- **SALT (Satisfaction And Loyalty Tracking)** — Guest feedback surveys\n\n### Business Domains\n- Guest Experience (booking, check-in, stay, checkout)\n- Revenue Management (pricing, availability, rate strategies)\n- Loyalty & Rewards (points, tiers: Member/Silver/Gold/Diamond)\n- Property Operations (housekeeping, maintenance, F&B)\n- Group Sales (meetings, events, RFP responses)\n- Owner Relations (franchise management, brand standards)\n\n### Compliance & Standards\n- PCI DSS for payment processing\n- GDPR/CCPA for guest data privacy\n- ADA/WCAG 2.1 AA for digital accessibility\n- Brand standards compliance per property tier\n\n### Integration Points\n- Amadeus/Sabre/Travelport (GDS channels)\n- OTAs (Expedia, Booking.com, etc.)\n- Payment gateways (Stripe, Adyen)\n- CRM (Salesforce)\n- Analytics (Adobe Analytics, Google Analytics)\n- CDN (Akamai for hilton.com)\n\n### Testing Focus Areas\n- Multi-brand booking flows\n- Loyalty point accrual and redemption\n- Rate parity across channels\n- Mobile app (iOS/Android) — Digital Key, room selection\n- Accessibility compliance\n- Performance under peak booking loads\n- Internationalization (40+ languages, multi-currency)\n- Property-level configuration variance'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  knowledge_docs = EXCLUDED.knowledge_docs;

-- ============================================================
-- 2. PROJECTS
-- ============================================================

-- Project 1: Hilton.com Direct Booking Platform
INSERT INTO projects (id, domain_id, name, description, jira_project_key, jira_url, brd_document, status)
VALUES (
  'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'Hilton.com Direct Booking',
  'Primary direct booking platform for all Hilton brands. Handles room search, availability, rate display, reservation creation, modification, and cancellation. Integrated with Hilton Honors loyalty program for member pricing and point redemptions.',
  'HCOM',
  'https://jira.hilton.com/projects/HCOM',
  E'## BRD: Hilton.com Direct Booking Platform\n\n### Objective\nDeliver a best-in-class direct booking experience that drives guests away from OTAs toward hilton.com, increasing direct booking share to 55%+ of total digital revenue.\n\n### Key Requirements\n1. **Search & Availability**: Multi-destination search, flexible dates, room type filtering, rate comparison\n2. **Member Pricing**: Hilton Honors members see exclusive discounted rates (10-25% off BAR)\n3. **Points Booking**: Redeem Honors points for free nights, points + money combinations\n4. **Rate Transparency**: Best Price Guarantee badge, rate breakdown with taxes/fees\n5. **Multi-Room Booking**: Support groups of up to 9 rooms in single transaction\n6. **Accessibility**: WCAG 2.1 AA compliant across all booking flows\n7. **Performance**: Page load < 3s, search results < 2s, booking confirmation < 5s\n8. **Mobile-First**: 65%+ traffic is mobile; responsive design with progressive enhancement\n\n### Success Metrics\n- Direct booking conversion rate > 4.2%\n- Cart abandonment rate < 68%\n- Mobile booking share > 40%\n- Guest satisfaction (SALT digital) > 8.5/10',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  jira_project_key = EXCLUDED.jira_project_key,
  jira_url = EXCLUDED.jira_url,
  brd_document = EXCLUDED.brd_document,
  status = EXCLUDED.status;

-- Project 2: Hilton Honors Loyalty Platform
INSERT INTO projects (id, domain_id, name, description, jira_project_key, jira_url, brd_document, status)
VALUES (
  'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'Hilton Honors Loyalty Platform',
  'Loyalty program management for 130M+ members across 4 tiers (Member, Silver, Gold, Diamond). Handles point earning, redemption, tier qualification, partner integrations, and member communication preferences.',
  'HHON',
  'https://jira.hilton.com/projects/HHON',
  E'## BRD: Hilton Honors Loyalty Platform\n\n### Objective\nDeliver a unified loyalty experience across all channels driving member engagement, repeat bookings, and lifetime value.\n\n### Key Requirements\n1. **Tier Management**: Auto-upgrade/downgrade based on nights/stays/points earned\n2. **Points Engine**: Earn 10 base points per $1 spent; tier bonuses (Silver 20%, Gold 80%, Diamond 100%)\n3. **Redemption**: Standard rewards, points + money, experience rewards, Amazon Shop with Points\n4. **Partner Integration**: Lyft, credit card partners (Amex), airline mile transfers\n5. **Member Dashboard**: Points balance, tier progress, upcoming stays, past activity\n6. **Communication Preferences**: Email, push, SMS opt-in/out management\n\n### Success Metrics\n- Active member growth > 12% YoY\n- Points redemption rate > 45%\n- Member direct booking share > 72%\n- NPS for loyalty program > 65',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  jira_project_key = EXCLUDED.jira_project_key,
  jira_url = EXCLUDED.jira_url,
  brd_document = EXCLUDED.brd_document,
  status = EXCLUDED.status;

-- Project 3: Group Sales & RFP Management (Salesforce)
INSERT INTO projects (id, domain_id, name, description, jira_project_key, jira_url, brd_document, status)
VALUES (
  'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'Group Sales & RFP Platform',
  'Salesforce-based platform for managing group hotel bookings, meeting space requests, event planning RFPs, and corporate account management. Includes the Request Access portal for new property onboarding and vendor registration.',
  'GSRFP',
  'https://jira.hilton.com/projects/GSRFP',
  E'## BRD: Group Sales & RFP Management\n\n### Objective\nStreamline the group booking and RFP lifecycle from lead capture through event execution, increasing group revenue by 15% while reducing sales cycle time by 20%.\n\n### Key Requirements\n1. **Request Access Portal**: Self-service registration for properties, vendors, and partners\n2. **RFP Workflow**: Create, review, respond to, and track RFPs with multi-property support\n3. **Group Booking**: Room blocks, meeting space allocation, catering packages, A/V requirements\n4. **Contract Management**: Digital proposals, e-signatures, amendment tracking\n5. **Reporting**: Pipeline analytics, win/loss analysis, revenue forecasting by property and region\n6. **CRM Integration**: Salesforce-native with custom objects for hospitality-specific entities\n\n### Success Metrics\n- RFP response time < 24 hours\n- Group booking conversion > 32%\n- Average deal size increase > 8%\n- Sales rep adoption rate > 90%',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  jira_project_key = EXCLUDED.jira_project_key,
  jira_url = EXCLUDED.jira_url,
  brd_document = EXCLUDED.brd_document,
  status = EXCLUDED.status;

-- Project 4: Hilton Mobile App
INSERT INTO projects (id, domain_id, name, description, jira_project_key, jira_url, brd_document, status)
VALUES (
  'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'Hilton Honors Mobile App',
  'Native iOS and Android app for Hilton Honors members. Features Digital Key (Bluetooth room unlock), mobile check-in/checkout, room selection on floor plan, Connected Room controls, and in-app booking.',
  'HAPP',
  'https://jira.hilton.com/projects/HAPP',
  E'## BRD: Hilton Honors Mobile App\n\n### Objective\nBe the #1 rated hotel app with industry-leading Digital Key adoption, driving 50%+ of check-ins through mobile.\n\n### Key Requirements\n1. **Digital Key**: BLE-based room unlock, share key with travel companions\n2. **Mobile Check-in**: Pre-arrival check-in with room selection on floor map\n3. **Connected Room**: Control thermostat, lighting, TV, curtains via app\n4. **In-App Booking**: Full booking flow with Apple Pay / Google Pay\n5. **Loyalty Dashboard**: Points balance, tier status, upcoming/past reservations\n6. **Property Info**: Hotel amenities, dining, pool hours, local experiences\n7. **Push Notifications**: Pre-arrival reminders, room ready alerts, checkout prompts\n\n### Success Metrics\n- App store rating > 4.7\n- Digital Key adoption > 35% of eligible stays\n- Mobile check-in rate > 50%\n- Monthly active users > 15M',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  jira_project_key = EXCLUDED.jira_project_key,
  jira_url = EXCLUDED.jira_url,
  brd_document = EXCLUDED.brd_document,
  status = EXCLUDED.status;

-- ============================================================
-- 3. APPLICATIONS
-- ============================================================

-- Apps for Hilton.com Direct Booking
INSERT INTO applications (id, project_id, name, app_type, url, description, documentation_url, codebase_url, status)
VALUES
  ('f5a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c', 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', 'Hilton.com Booking Engine', 'web', 'https://www.hilton.com/en/book/reservation/rooms/', 'Primary guest-facing booking engine. React SPA with Next.js SSR for SEO. Handles search, availability grid, room selection, add-ons, payment, and confirmation.', 'https://confluence.hilton.com/display/HCOM/Booking+Engine+API+Docs', 'https://github.hilton.com/digital/booking-engine', 'active'),
  ('a6b7c8d9-e0f1-4a2b-3c4d-5e6f7a8b9c0d', 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', 'Hilton.com Search API', 'api', 'https://api.hilton.com/v1/search', 'Backend search service powering hotel/destination search, autocomplete, availability queries, and rate calculations. Go microservice deployed on Kubernetes.', 'https://confluence.hilton.com/display/HCOM/Search+API+v1', 'https://github.hilton.com/digital/search-api', 'active'),
  ('b7c8d9e0-f1a2-4b3c-4d5e-6f7a8b9c0d1e', 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', 'Hilton.com CMS', 'web', 'https://cms.hilton.com', 'Content management system for hotel pages, landing pages, promotions, and brand content. Built on Adobe Experience Manager (AEM).', 'https://confluence.hilton.com/display/HCOM/AEM+Author+Guide', '', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  app_type = EXCLUDED.app_type,
  url = EXCLUDED.url,
  description = EXCLUDED.description,
  documentation_url = EXCLUDED.documentation_url,
  codebase_url = EXCLUDED.codebase_url,
  status = EXCLUDED.status;

-- Apps for Hilton Honors Loyalty
INSERT INTO applications (id, project_id, name, app_type, url, description, documentation_url, codebase_url, status)
VALUES
  ('c8d9e0f1-a2b3-4c4d-5e6f-7a8b9c0d1e2f', 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f', 'Honors Member Portal', 'web', 'https://www.hilton.com/en/hilton-honors/member/', 'Member dashboard showing points balance, tier progress, transaction history, and reward redemption. React app integrated with Honors API.', 'https://confluence.hilton.com/display/HHON/Member+Portal+Specs', 'https://github.hilton.com/loyalty/member-portal', 'active'),
  ('d9e0f1a2-b3c4-4d5e-6f7a-8b9c0d1e2f3a', 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f', 'Honors Points Engine API', 'api', 'https://api.hilton.com/v1/honors/points', 'Core points calculation, accrual, and redemption engine. Handles tier qualification logic, partner point transfers, and promotional bonuses.', 'https://confluence.hilton.com/display/HHON/Points+Engine+API', 'https://github.hilton.com/loyalty/points-engine', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  app_type = EXCLUDED.app_type,
  url = EXCLUDED.url,
  description = EXCLUDED.description,
  documentation_url = EXCLUDED.documentation_url,
  codebase_url = EXCLUDED.codebase_url,
  status = EXCLUDED.status;

-- Apps for Group Sales / RFP (Salesforce)
INSERT INTO applications (id, project_id, name, app_type, url, description, documentation_url, codebase_url, status)
VALUES
  ('e0f1a2b3-c4d5-4e6f-7a8b-9c0d1e2f3a4b', 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a', 'Request Access Portal', 'web', 'https://hilton--qa.sandbox.my.site.com/s/request-access', 'Self-service portal for new property managers, vendors, and partners to request access to Hilton systems. Built on Salesforce Experience Cloud with custom LWC components.', 'https://confluence.hilton.com/display/GSRFP/Request+Access+Portal', 'https://github.hilton.com/salesforce/request-access-lwc', 'active'),
  ('f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c', 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a', 'RFP Management Dashboard', 'web', 'https://hilton--qa.sandbox.my.site.com/s/rfp-dashboard', 'Salesforce-based RFP tracking dashboard for sales reps. Manage proposals, track response deadlines, view pipeline analytics.', 'https://confluence.hilton.com/display/GSRFP/RFP+Dashboard+Guide', 'https://github.hilton.com/salesforce/rfp-dashboard', 'active'),
  ('a2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a', 'Group Booking API', 'api', 'https://api.hilton.com/v1/groups', 'REST API for group room block management, meeting space availability, catering quotes, and contract generation.', 'https://confluence.hilton.com/display/GSRFP/Group+Booking+API', 'https://github.hilton.com/salesforce/group-booking-api', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  app_type = EXCLUDED.app_type,
  url = EXCLUDED.url,
  description = EXCLUDED.description,
  documentation_url = EXCLUDED.documentation_url,
  codebase_url = EXCLUDED.codebase_url,
  status = EXCLUDED.status;

-- Apps for Mobile App
INSERT INTO applications (id, project_id, name, app_type, url, description, documentation_url, codebase_url, status)
VALUES
  ('b3c4d5e6-f7a8-4b9c-0d1e-2f3a4b5c6d7e', 'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b', 'Hilton Honors iOS App', 'mobile', 'https://apps.apple.com/app/hilton-honors/id635150066', 'Native iOS app with Digital Key, mobile check-in, Connected Room, and in-app booking. Built with Swift/SwiftUI, minimum iOS 16.', 'https://confluence.hilton.com/display/HAPP/iOS+Developer+Guide', 'https://github.hilton.com/mobile/hilton-ios', 'active'),
  ('c4d5e6f7-a8b9-4c0d-1e2f-3a4b5c6d7e8f', 'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b', 'Hilton Honors Android App', 'mobile', 'https://play.google.com/store/apps/details?id=com.hilton.android.hhonors', 'Native Android app with Digital Key, mobile check-in, Connected Room. Built with Kotlin/Jetpack Compose, minimum Android 10.', 'https://confluence.hilton.com/display/HAPP/Android+Developer+Guide', 'https://github.hilton.com/mobile/hilton-android', 'active'),
  ('d5e6f7a8-b9c0-4d1e-2f3a-4b5c6d7e8f9a', 'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b', 'Mobile BFF API', 'api', 'https://api.hilton.com/v1/mobile', 'Backend-for-Frontend API layer for mobile apps. Aggregates data from booking, loyalty, Digital Key, and Connected Room services into mobile-optimized payloads.', 'https://confluence.hilton.com/display/HAPP/Mobile+BFF+API', 'https://github.hilton.com/mobile/mobile-bff', 'active')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  app_type = EXCLUDED.app_type,
  url = EXCLUDED.url,
  description = EXCLUDED.description,
  documentation_url = EXCLUDED.documentation_url,
  codebase_url = EXCLUDED.codebase_url,
  status = EXCLUDED.status;

-- ============================================================
-- 4. TEST SUITES
-- ============================================================

-- Suites for Hilton.com Direct Booking
INSERT INTO test_suites (id, project_id, name, suite_type, description, status, total_cases, passed_cases, failed_cases)
VALUES
  ('11111111-aaaa-4bbb-cccc-dddddddddddd', 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', 'Booking Flow Smoke Tests', 'smoke', 'Critical path smoke tests for the end-to-end booking flow: search → select hotel → choose room → enter payment → confirm reservation.', 'completed', 8, 7, 1),
  ('22222222-aaaa-4bbb-cccc-dddddddddddd', 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', 'Search & Availability Sprint 24.3', 'sprint', 'Sprint 24.3 test cases for new flexible date search, map-based hotel discovery, and rate calendar enhancements.', 'executing', 12, 8, 2),
  ('33333333-aaaa-4bbb-cccc-dddddddddddd', 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', 'Booking Engine Regression', 'regression', 'Full regression suite covering all booking paths: standard, points, points+money, corporate, group, and promotional rates.', 'approved', 45, 40, 3),
  ('44444444-aaaa-4bbb-cccc-dddddddddddd', 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e', 'Payment Integration Tests', 'integration', 'Integration tests for payment gateway interactions: credit card tokenization, Amex integration, Apple Pay, Google Pay, and PCI compliance validation.', 'completed', 15, 14, 1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  suite_type = EXCLUDED.suite_type,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  total_cases = EXCLUDED.total_cases,
  passed_cases = EXCLUDED.passed_cases,
  failed_cases = EXCLUDED.failed_cases;

-- Suites for Hilton Honors Loyalty
INSERT INTO test_suites (id, project_id, name, suite_type, description, status, total_cases, passed_cases, failed_cases)
VALUES
  ('55555555-aaaa-4bbb-cccc-dddddddddddd', 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f', 'Points Accrual & Redemption E2E', 'e2e', 'End-to-end tests for points earning on stays, credit card spend, partner activities, and redemption for free nights, upgrades, and Amazon purchases.', 'completed', 20, 18, 2),
  ('66666666-aaaa-4bbb-cccc-dddddddddddd', 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f', 'Tier Qualification Module Tests', 'module', 'Module tests for tier upgrade/downgrade logic: night counting, rollover nights, milestone bonuses, and status match processing.', 'completed', 14, 13, 1),
  ('77777777-aaaa-4bbb-cccc-dddddddddddd', 'c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f', 'Member Portal Regression', 'regression', 'Regression tests for the Honors member portal: login, dashboard, transaction history, reward catalog, profile management, and communication preferences.', 'approved', 30, 26, 2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  suite_type = EXCLUDED.suite_type,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  total_cases = EXCLUDED.total_cases,
  passed_cases = EXCLUDED.passed_cases,
  failed_cases = EXCLUDED.failed_cases;

-- Suites for Group Sales / RFP
INSERT INTO test_suites (id, project_id, name, suite_type, description, status, total_cases, passed_cases, failed_cases)
VALUES
  ('88888888-aaaa-4bbb-cccc-dddddddddddd', 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a', 'Request Access Portal E2E', 'e2e', 'End-to-end tests for the self-service Request Access portal: registration form, field validation, email verification, account creation, and admin approval workflow.', 'completed', 10, 8, 2),
  ('99999999-aaaa-4bbb-cccc-dddddddddddd', 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a', 'RFP Workflow Smoke Tests', 'smoke', 'Smoke tests for RFP lifecycle: create RFP, assign properties, receive proposals, compare responses, award contract.', 'completed', 6, 6, 0),
  ('aaaaaaaa-aaaa-4bbb-cccc-dddddddddddd', 'd3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f7a', 'Salesforce Integration Tests', 'integration', 'Integration tests between custom LWC components, Salesforce standard objects, and external APIs (payment, loyalty, property inventory).', 'executing', 18, 12, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  suite_type = EXCLUDED.suite_type,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  total_cases = EXCLUDED.total_cases,
  passed_cases = EXCLUDED.passed_cases,
  failed_cases = EXCLUDED.failed_cases;

-- Suites for Mobile App
INSERT INTO test_suites (id, project_id, name, suite_type, description, status, total_cases, passed_cases, failed_cases)
VALUES
  ('bbbbbbbb-aaaa-4bbb-cccc-dddddddddddd', 'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b', 'Digital Key Smoke Tests', 'smoke', 'Critical path smoke tests for Digital Key: BLE pairing, key provisioning, door unlock, key sharing, and offline mode.', 'completed', 7, 6, 1),
  ('cccccccc-aaaa-4bbb-cccc-dddddddddddd', 'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b', 'Mobile Check-in Sprint 24.4', 'sprint', 'Sprint 24.4 tests for enhanced room selection with 3D floor plan, accessibility room filters, and connecting room requests.', 'executing', 9, 5, 1),
  ('dddddddd-aaaa-4bbb-cccc-dddddddddddd', 'e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7a8b', 'Connected Room E2E', 'e2e', 'End-to-end tests for Connected Room IoT controls: thermostat, lighting scenes, TV casting, curtain control, and voice commands via app.', 'approved', 16, 14, 2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  suite_type = EXCLUDED.suite_type,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  total_cases = EXCLUDED.total_cases,
  passed_cases = EXCLUDED.passed_cases,
  failed_cases = EXCLUDED.failed_cases;

-- ============================================================
-- 5. TEST CASES
-- ============================================================

-- Test Cases for Booking Flow Smoke Tests
INSERT INTO test_cases (id, test_suite_id, title, description, preconditions, steps, expected_result, priority, status, category)
VALUES
  ('10000001-aaaa-4bbb-cccc-dddddddddddd', '11111111-aaaa-4bbb-cccc-dddddddddddd', 'Search Hotels by Destination', 'Verify destination search returns relevant hotel results with availability', 'User is on hilton.com homepage. Dates are set to 30 days from today.', E'1. Navigate to hilton.com\n2. Enter "New York" in destination search\n3. Select check-in date (30 days from today)\n4. Select check-out date (32 days from today)\n5. Set 1 room, 2 adults\n6. Click "Find Hotels"', 'Search results page displays available Hilton properties in New York. Results show hotel name, star rating, price per night, distance from city center, and "Best Price Guarantee" badge.', 'critical', 'passed', 'functional'),
  ('10000002-aaaa-4bbb-cccc-dddddddddddd', '11111111-aaaa-4bbb-cccc-dddddddddddd', 'Select Room and View Rate Breakdown', 'Verify room selection shows detailed rate breakdown with taxes and fees', 'User has searched and is viewing hotel results for New York Hilton Midtown.', E'1. Click "View Rates" on New York Hilton Midtown\n2. Review available room types (King, Double Queen, Suite)\n3. Click "Select" on King Deluxe room\n4. Verify rate breakdown panel appears', 'Rate breakdown shows: base rate per night, resort fee (if applicable), taxes, total for stay. Member pricing shows discounted rate with savings amount highlighted in green.', 'critical', 'passed', 'functional'),
  ('10000003-aaaa-4bbb-cccc-dddddddddddd', '11111111-aaaa-4bbb-cccc-dddddddddddd', 'Complete Booking with Credit Card', 'Verify end-to-end booking with credit card payment and confirmation', 'User has selected a King Deluxe room at NY Hilton Midtown. User is logged in as Hilton Honors member.', E'1. On payment page, enter guest details (name, email, phone)\n2. Enter credit card: 4111-1111-1111-1111, exp 12/27, CVV 123\n3. Review booking summary (dates, room, rate, total)\n4. Accept cancellation policy checkbox\n5. Click "Complete Booking"', 'Confirmation page displays with: confirmation number, hotel name, dates, room type, total charged, Honors points earned estimate, and "Add to Calendar" / "Email Confirmation" buttons.', 'critical', 'passed', 'functional'),
  ('10000004-aaaa-4bbb-cccc-dddddddddddd', '11111111-aaaa-4bbb-cccc-dddddddddddd', 'Book with Hilton Honors Points', 'Verify points-only booking flow for reward nights', 'User is logged in as Diamond member with 200,000 points balance.', E'1. Search for hotels in Chicago, 1 night\n2. Toggle "Use Points" filter on\n3. Verify point costs displayed per hotel\n4. Select Palmer House Hilton (50,000 pts/night)\n5. Confirm points redemption\n6. Complete booking', 'Booking confirmed with 0 USD charged. Points balance decremented by 50,000. Confirmation shows "Reward Night" badge and remaining points balance.', 'high', 'passed', 'functional'),
  ('10000005-aaaa-4bbb-cccc-dddddddddddd', '11111111-aaaa-4bbb-cccc-dddddddddddd', 'Modify Existing Reservation Dates', 'Verify date modification on existing reservation', 'User has a confirmed reservation at Conrad Miami for Jun 15-17.', E'1. Navigate to "My Reservations"\n2. Find Conrad Miami reservation\n3. Click "Modify Reservation"\n4. Change dates to Jun 16-19 (extend 1 night)\n5. Review rate difference\n6. Confirm modification', 'Reservation updated with new dates Jun 16-19. Rate recalculated for 3 nights. Modified confirmation number shown. Email sent with updated itinerary.', 'high', 'passed', 'functional'),
  ('10000006-aaaa-4bbb-cccc-dddddddddddd', '11111111-aaaa-4bbb-cccc-dddddddddddd', 'Cancel Reservation Within Free Period', 'Verify free cancellation within policy window', 'User has a reservation with "Free Cancellation until 48 hours before check-in" policy. Check-in is 7 days away.', E'1. Go to "My Reservations"\n2. Click "Cancel" on the reservation\n3. Review cancellation policy details\n4. Confirm cancellation\n5. Verify no charges applied', 'Reservation cancelled. Status shows "Cancelled". No charges applied. Confirmation email sent. Honors points (if points booking) refunded within 24 hours.', 'high', 'passed', 'functional'),
  ('10000007-aaaa-4bbb-cccc-dddddddddddd', '11111111-aaaa-4bbb-cccc-dddddddddddd', 'Mobile Responsive Booking Flow', 'Verify booking flow works correctly on mobile viewport', 'User is on iPhone 14 Pro (390x844). Wi-Fi connection.', E'1. Open hilton.com in mobile Safari\n2. Search "London" for 2 nights\n3. Filter by "Hilton" brand\n4. Select room at London Hilton on Park Lane\n5. Complete booking on mobile\n6. Verify confirmation page renders correctly', 'All booking steps render correctly in mobile viewport. Touch targets are minimum 44x44px. Keyboard does not obscure form fields. Payment form supports autofill. Confirmation is mobile-optimized with click-to-call hotel number.', 'high', 'passed', 'functional'),
  ('10000008-aaaa-4bbb-cccc-dddddddddddd', '11111111-aaaa-4bbb-cccc-dddddddddddd', 'Accessibility: Screen Reader Booking Flow', 'Verify WCAG 2.1 AA compliance for complete booking flow with screen reader', 'VoiceOver (iOS) or NVDA (Windows) is enabled. User navigates via keyboard only.', E'1. Navigate to hilton.com using Tab key\n2. Search for hotels using keyboard only\n3. Verify all form labels are announced\n4. Select room using Enter/Space keys\n5. Complete payment form\n6. Verify focus management on confirmation page', 'All interactive elements are keyboard accessible. Form fields have proper ARIA labels. Error messages are announced. Focus moves logically through the booking flow. Confirmation page heading receives focus on load.', 'critical', 'failed', 'accessibility')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  preconditions = EXCLUDED.preconditions,
  steps = EXCLUDED.steps,
  expected_result = EXCLUDED.expected_result,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  category = EXCLUDED.category;

-- Test Cases for Request Access Portal E2E
INSERT INTO test_cases (id, test_suite_id, title, description, preconditions, steps, expected_result, priority, status, category)
VALUES
  ('20000001-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Submit Request Access Form — Happy Path', 'Verify complete registration flow with all required fields', 'User navigates to the Request Access portal. No existing account.', E'1. Navigate to https://hilton--qa.sandbox.my.site.com/s/request-access\n2. Enter First Name: "Akhleaditya"\n3. Enter Last Name: "M"\n4. Enter Email: "sample@sample.com"\n5. Enter Company: "Sam''s Hospitality LLC"\n6. Enter Property Name: "The Sam Houston"\n7. Select Request Type: "Property Access"\n8. Enter Job Title: "Solution Lead"\n9. Click "Submit Request"', 'Success message displayed: "Your request has been submitted successfully." Confirmation email sent to sample@sample.com. Request appears in admin queue with status "Pending Review".', 'critical', 'passed', 'functional'),
  ('20000002-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Form Validation — Required Fields', 'Verify validation errors appear for blank required fields', 'User is on Request Access form page.', E'1. Leave all fields blank\n2. Click "Submit Request"\n3. Verify error messages appear for each required field\n4. Enter only First Name\n5. Click "Submit Request" again\n6. Verify remaining field errors persist', 'Inline validation errors shown below each required field: "First Name is required", "Last Name is required", "Email is required", "Company is required". Submit button is disabled until all required fields are valid.', 'high', 'passed', 'functional'),
  ('20000003-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Email Format Validation', 'Verify email field rejects invalid formats', 'User is on Request Access form.', E'1. Enter "notanemail" in email field\n2. Tab out or click submit\n3. Verify validation error\n4. Enter "user@" and verify error\n5. Enter "user@domain" and verify error\n6. Enter "user@domain.com" and verify accepted', 'Invalid email formats show error: "Please enter a valid email address." Only properly formatted emails (user@domain.tld) are accepted.', 'medium', 'passed', 'functional'),
  ('20000004-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Duplicate Email Prevention', 'Verify system prevents duplicate registrations with same email', 'A request already exists for "existing@hilton.com".', E'1. Navigate to Request Access form\n2. Fill all fields with valid data\n3. Enter "existing@hilton.com" as email\n4. Submit the form\n5. Verify duplicate detection', 'Error message: "An account with this email already exists. Please contact support or use a different email." Form does not submit.', 'high', 'failed', 'functional'),
  ('20000005-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Figma-to-App Visual Fidelity — Request Access Page', 'Design validation: compare Figma prototype screens with live Request Access portal', 'Figma file: jl5gM84hdUjbyHo9lFpTUO (Hilton). App URL: https://hilton--qa.sandbox.my.site.com/s/request-access. Prototype password: Hilton@123KSG', E'1. Open Figma prototype in KIT Design Validation\n2. Set Figma URL and App URL\n3. Run full prototype journey validation\n4. AI crawls each Figma screen and navigates the live app\n5. Screenshot pairs are captured and compared\n6. Review fidelity scores across Visual, Layout, Component, Token/Theme, UX Flow', 'Design fidelity score >= 70% across all dimensions. Color palette matches within 5% delta E. Typography (font family, size, weight) matches. Layout spacing within 4px tolerance. All form components (inputs, buttons, dropdowns) render consistently. Journey flow matches prototype navigation sequence.', 'critical', 'passed', 'design_validation'),
  ('20000006-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Mobile Responsive — Request Access Portal', 'Verify Request Access portal renders correctly on mobile devices', 'iPhone 14 Pro viewport (390x844).', E'1. Open Request Access URL on mobile viewport\n2. Verify form fields stack vertically\n3. Verify text is readable without horizontal scroll\n4. Fill form on mobile\n5. Submit and verify confirmation', 'All form elements are visible without horizontal scrolling. Touch targets are minimum 44x44px. Virtual keyboard does not obscure active input field. Success message is fully visible on mobile.', 'high', 'passed', 'responsive'),
  ('20000007-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Admin Approval Workflow', 'Verify admin can review and approve/reject access requests', 'Admin user is logged into Salesforce. A pending request exists from "sample@sample.com".', E'1. Log into Salesforce as admin\n2. Navigate to "Request Access" queue\n3. Find request from "sample@sample.com"\n4. Review request details\n5. Click "Approve"\n6. Verify approval email sent to requester', 'Request status changes from "Pending Review" to "Approved". Welcome email sent to requester with login credentials. Account created in the system with appropriate permissions based on request type.', 'high', 'passed', 'functional'),
  ('20000008-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Cross-Browser — Request Access Portal', 'Verify portal works across Chrome, Firefox, Safari, Edge', 'Access to Chrome 120+, Firefox 121+, Safari 17+, Edge 120+.', E'1. Open Request Access portal in Chrome — verify layout, submit form\n2. Open in Firefox — verify layout, submit form\n3. Open in Safari — verify layout, submit form\n4. Open in Edge — verify layout, submit form\n5. Compare screenshots across browsers', 'Form renders consistently across all browsers. No layout shifts, broken styles, or JavaScript errors. Form submission works in all browsers. Success confirmation displays correctly.', 'medium', 'passed', 'compatibility'),
  ('20000009-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Performance — Form Load Time', 'Verify Request Access page loads within acceptable time', 'Network throttled to "Fast 3G" in DevTools.', E'1. Clear browser cache\n2. Navigate to Request Access URL\n3. Measure time to First Contentful Paint (FCP)\n4. Measure time to Largest Contentful Paint (LCP)\n5. Measure Time to Interactive (TTI)\n6. Run Lighthouse performance audit', 'FCP < 1.5s, LCP < 2.5s, TTI < 3.5s on Fast 3G. Lighthouse performance score >= 75. No layout shifts (CLS < 0.1). JavaScript bundle size < 500KB gzipped.', 'medium', 'failed', 'performance'),
  ('20000010-aaaa-4bbb-cccc-dddddddddddd', '88888888-aaaa-4bbb-cccc-dddddddddddd', 'Security — XSS Prevention in Form Fields', 'Verify form fields sanitize script injection attempts', 'User is on Request Access form.', E'1. Enter <script>alert("XSS")</script> in First Name field\n2. Enter " onmouseover="alert(1) in Last Name field\n3. Enter javascript:alert(1) in Company field\n4. Submit the form\n5. Verify stored data is sanitized\n6. Verify no script execution occurs', 'All input is sanitized/escaped before storage and display. No alert dialogs appear. Stored values show escaped HTML entities. Admin view shows sanitized text, not executable scripts.', 'critical', 'passed', 'security')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  preconditions = EXCLUDED.preconditions,
  steps = EXCLUDED.steps,
  expected_result = EXCLUDED.expected_result,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  category = EXCLUDED.category;

-- Test Cases for Points Accrual & Redemption E2E
INSERT INTO test_cases (id, test_suite_id, title, description, preconditions, steps, expected_result, priority, status, category)
VALUES
  ('30000001-aaaa-4bbb-cccc-dddddddddddd', '55555555-aaaa-4bbb-cccc-dddddddddddd', 'Earn Base Points on Hotel Stay', 'Verify correct base point accrual after checkout', 'Member (Gold tier) completes a 2-night stay at $200/night at Hilton Garden Inn.', E'1. Complete checkout at hotel\n2. Wait for folio posting (usually 3-5 days)\n3. Log into Honors member portal\n4. Navigate to Activity tab\n5. Verify points earned for the stay', 'Points earned: 2 nights × $200 × 10 base points = 4,000 base points. Gold tier bonus (80%): 3,200 bonus points. Total credited: 7,200 points. Activity shows line items for base + bonus separately.', 'critical', 'passed', 'functional'),
  ('30000002-aaaa-4bbb-cccc-dddddddddddd', '55555555-aaaa-4bbb-cccc-dddddddddddd', 'Redeem Points for Free Night', 'Verify points redemption deducts correct amount', 'Diamond member with 150,000 points. Waldorf Astoria Beverly Hills requires 95,000 pts standard.', E'1. Search "Beverly Hills" with Use Points toggle\n2. Select Waldorf Astoria (95,000 pts/night)\n3. Confirm redemption\n4. Complete booking\n5. Verify points balance', 'Booking confirmed as Reward Night. Points balance reduced by 95,000 (from 150,000 to 55,000). No cash charges. Confirmation shows "Reward Night" designation. 5th Night Free promo applied if booking 5+ nights.', 'critical', 'passed', 'functional'),
  ('30000003-aaaa-4bbb-cccc-dddddddddddd', '55555555-aaaa-4bbb-cccc-dddddddddddd', 'Points + Money Combination Booking', 'Verify combined points and cash payment', 'Member with 30,000 points. Room costs 40,000 points or $180/night.', E'1. Search for available hotels\n2. Toggle Points + Money option\n3. Select slider to use 20,000 points + cash\n4. Verify cash amount calculated\n5. Complete booking with credit card for remainder', 'Booking confirmed with 20,000 points + $90 cash (50% points = 50% cash reduction). Points deducted immediately. Credit card charged $90 + taxes. Confirmation shows split payment breakdown.', 'high', 'passed', 'functional'),
  ('30000004-aaaa-4bbb-cccc-dddddddddddd', '55555555-aaaa-4bbb-cccc-dddddddddddd', 'Transfer Points to Airline Partner', 'Verify points transfer to airline loyalty program', 'Gold member with 20,000 points. Linked American Airlines AAdvantage account.', E'1. Navigate to Points Transfer in member portal\n2. Select American Airlines\n3. Enter transfer amount: 10,000 points\n4. Confirm transfer (10,000 Honors = 2,500 AAdvantage miles)\n5. Verify balances updated', 'Honors points reduced by 10,000. AAdvantage account credited with 2,500 miles within 6 weeks. Transaction logged in activity history with "Points Transfer" category. Cannot reverse transfer.', 'medium', 'passed', 'functional'),
  ('30000005-aaaa-4bbb-cccc-dddddddddddd', '55555555-aaaa-4bbb-cccc-dddddddddddd', 'Earn Points on Credit Card Spend', 'Verify points earned from Hilton Honors Amex card spend', 'Member has Hilton Honors American Express Surpass card linked. Made $500 purchase at restaurant.', E'1. Wait for Amex statement cycle\n2. Check Honors activity in member portal\n3. Verify points from card spend\n4. Confirm category bonus applied', 'Restaurant spend earns 6x points: $500 × 6 = 3,000 points. Posted within 1-2 billing cycles. Activity shows "American Express Card Activity" as source. Separate from hotel stay earnings.', 'medium', 'passed', 'functional')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  preconditions = EXCLUDED.preconditions,
  steps = EXCLUDED.steps,
  expected_result = EXCLUDED.expected_result,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  category = EXCLUDED.category;

-- Test Cases for Digital Key Smoke Tests
INSERT INTO test_cases (id, test_suite_id, title, description, preconditions, steps, expected_result, priority, status, category)
VALUES
  ('40000001-aaaa-4bbb-cccc-dddddddddddd', 'bbbbbbbb-aaaa-4bbb-cccc-dddddddddddd', 'Digital Key — BLE Room Unlock', 'Verify Bluetooth-based room door unlock with Digital Key', 'Guest has completed mobile check-in. Digital Key provisioned. Phone Bluetooth is ON. Standing within 5 feet of assigned room door.', E'1. Open Hilton Honors app\n2. Navigate to "Digital Key" tab\n3. Hold phone near door lock\n4. Wait for BLE handshake (indicated by haptic feedback)\n5. Door unlocks within 3 seconds', 'Door unlocks with audible click and green LED on lock. App shows "Door Unlocked" animation. Usage logged in Digital Key history. Works without internet connection (offline capable after initial provisioning).', 'critical', 'passed', 'functional'),
  ('40000002-aaaa-4bbb-cccc-dddddddddddd', 'bbbbbbbb-aaaa-4bbb-cccc-dddddddddddd', 'Share Digital Key with Companion', 'Verify key sharing to travel companion', 'Guest has active Digital Key. Companion has Hilton Honors app installed.', E'1. Open Digital Key settings\n2. Tap "Share Key"\n3. Enter companion email: companion@email.com\n4. Companion receives push notification\n5. Companion opens app and accepts key\n6. Companion tests door unlock', 'Companion receives shared key with same room access. Both original guest and companion can unlock simultaneously. Shared key shows "Shared by [Guest Name]" label. Maximum 4 shared keys per room.', 'high', 'passed', 'functional'),
  ('40000003-aaaa-4bbb-cccc-dddddddddddd', 'bbbbbbbb-aaaa-4bbb-cccc-dddddddddddd', 'Digital Key — Elevator Access', 'Verify Digital Key grants elevator floor access', 'Guest has Digital Key for room on floor 12.', E'1. Approach elevator with app open\n2. Tap elevator reader with phone\n3. Verify floor 12 button becomes active\n4. Press floor 12\n5. Elevator goes to floor 12', 'Elevator reader accepts Digital Key via BLE/NFC. Only assigned floor and public floors (lobby, pool, fitness) are enabled. Other floors remain locked. Works same as physical key card.', 'high', 'passed', 'functional'),
  ('40000004-aaaa-4bbb-cccc-dddddddddddd', 'bbbbbbbb-aaaa-4bbb-cccc-dddddddddddd', 'Digital Key — Revocation on Checkout', 'Verify Digital Key is automatically revoked at checkout', 'Guest is checking out. Digital Key is active.', E'1. Complete mobile checkout via app\n2. Attempt to use Digital Key on room door\n3. Verify key is revoked', 'Digital Key becomes inactive immediately upon checkout confirmation. App shows "Key Expired" status. Door lock rejects the key. Shared keys for companions are also revoked simultaneously.', 'critical', 'passed', 'functional'),
  ('40000005-aaaa-4bbb-cccc-dddddddddddd', 'bbbbbbbb-aaaa-4bbb-cccc-dddddddddddd', 'Digital Key — Low Battery Behavior', 'Verify graceful degradation when phone battery is critically low', 'Phone battery is at 2%. Digital Key was provisioned earlier.', E'1. With phone at 2% battery\n2. Open Hilton Honors app\n3. Navigate to Digital Key\n4. Attempt to unlock door\n5. Observe behavior when phone dies mid-unlock', 'Digital Key should work even at very low battery (leverages iOS/Android NFC power reserve if available). If phone dies before BLE handshake, app shows "Please charge your device or visit front desk" message on next boot. Fallback: front desk can issue physical key card.', 'medium', 'passed', 'functional'),
  ('40000006-aaaa-4bbb-cccc-dddddddddddd', 'bbbbbbbb-aaaa-4bbb-cccc-dddddddddddd', 'Digital Key — Wrong Room Prevention', 'Verify Digital Key cannot open rooms not assigned to the guest', 'Guest has Digital Key for Room 1204. Standing at Room 1205.', E'1. Hold phone near Room 1205 door lock\n2. Wait for BLE scan\n3. Verify rejection', 'Door does not unlock. App shows "This is not your room" or simply does not trigger unlock animation. No security event raised unless repeated attempts detected (>5 attempts = security alert to front desk).', 'critical', 'failed', 'security')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  preconditions = EXCLUDED.preconditions,
  steps = EXCLUDED.steps,
  expected_result = EXCLUDED.expected_result,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  category = EXCLUDED.category;

-- Test Cases for Tier Qualification Module Tests
INSERT INTO test_cases (id, test_suite_id, title, description, preconditions, steps, expected_result, priority, status, category)
VALUES
  ('50000001-aaaa-4bbb-cccc-dddddddddddd', '66666666-aaaa-4bbb-cccc-dddddddddddd', 'Silver Tier Qualification — 10 Nights', 'Verify auto-upgrade to Silver after 10 qualifying nights', 'Member is at base Member tier with 0 qualifying nights in current year.', E'1. Complete 10 qualifying nights (5 stays × 2 nights)\n2. Wait for posting\n3. Check tier status in member portal', 'Tier automatically upgraded from Member to Silver. Email sent: "Congratulations, you have earned Hilton Honors Silver status!" Silver benefits activated: 20% bonus points, 5th night free on reward stays. Tier badge updated in app and web portal.', 'critical', 'passed', 'functional'),
  ('50000002-aaaa-4bbb-cccc-dddddddddddd', '66666666-aaaa-4bbb-cccc-dddddddddddd', 'Gold Tier Qualification — 40 Nights', 'Verify auto-upgrade to Gold after 40 qualifying nights', 'Member is at Silver tier with 35 qualifying nights.', E'1. Complete 5 additional qualifying nights (total 40)\n2. Wait for posting\n3. Check tier status', 'Tier upgraded from Silver to Gold. Benefits activated: 80% bonus points, room upgrades (space available), late checkout, milestone bonus at 40 nights. Tier badge updated across all channels.', 'critical', 'passed', 'functional'),
  ('50000003-aaaa-4bbb-cccc-dddddddddddd', '66666666-aaaa-4bbb-cccc-dddddddddddd', 'Diamond Tier Qualification — 60 Nights', 'Verify auto-upgrade to Diamond after 60 qualifying nights', 'Member is at Gold tier with 55 qualifying nights.', E'1. Complete 5 additional nights (total 60)\n2. Wait for posting\n3. Check tier status', 'Tier upgraded from Gold to Diamond. Benefits: 100% bonus points, executive lounge access, 48-hour room guarantee, complimentary breakfast, Diamond Desk phone support. Personalized welcome email from SVP of Honors.', 'critical', 'passed', 'functional'),
  ('50000004-aaaa-4bbb-cccc-dddddddddddd', '66666666-aaaa-4bbb-cccc-dddddddddddd', 'Tier Downgrade — Year-End Requalification', 'Verify tier downgrade when requalification thresholds not met', 'Diamond member. Calendar year ended with only 25 qualifying nights (below Gold 40-night threshold).', E'1. New calendar year begins\n2. System runs annual tier requalification batch\n3. Check new tier status\n4. Verify grace period or rollover applied', 'Tier downgraded from Diamond to Silver (25 nights qualifies for Silver at 10 nights). Downgrade email sent with "Re-qualify by earning X more nights" message. Previous year benefits expire on March 31 (grace period).', 'high', 'passed', 'functional'),
  ('50000005-aaaa-4bbb-cccc-dddddddddddd', '66666666-aaaa-4bbb-cccc-dddddddddddd', 'Rollover Nights Calculation', 'Verify excess qualifying nights roll over to next year', 'Gold member achieved 60 nights (20 excess over Gold threshold of 40).', E'1. Year-end processing completes\n2. Check next year qualifying night count\n3. Verify rollover nights credited', 'New year starts with 20 rollover nights credited toward next year qualification. Rollover nights count toward tier but not milestone bonuses. Activity log shows "Rollover from [previous year]" entry.', 'medium', 'passed', 'functional')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  preconditions = EXCLUDED.preconditions,
  steps = EXCLUDED.steps,
  expected_result = EXCLUDED.expected_result,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  category = EXCLUDED.category;

-- ============================================================
-- 6. DESIGN VALIDATIONS (link existing Hilton validation to app)
-- ============================================================

-- Update the existing Hilton validation to link to the Request Access Portal app
UPDATE design_validations
SET application_id = 'e0f1a2b3-c4d5-4e6f-7a8b-9c0d1e2f3a4b'
WHERE id = '504711a3-63f3-445d-8bdd-392624084880'
  AND (application_id IS NULL OR application_id::text = '');

-- Add additional design validation entries
INSERT INTO design_validations (id, application_id, name, figma_url, app_url, status, overall_score, summary)
VALUES
  ('60000001-aaaa-4bbb-cccc-dddddddddddd', 'f5a6b7c8-d9e0-4f1a-2b3c-4d5e6f7a8b9c', 'Hilton.com Homepage Redesign Validation', 'https://www.figma.com/design/hilton-homepage-v3/Homepage-Redesign', 'https://www.hilton.com/en/', 'pending', NULL, ''),
  ('60000002-aaaa-4bbb-cccc-dddddddddddd', 'c8d9e0f1-a2b3-4c4d-5e6f-7a8b9c0d1e2f', 'Honors Dashboard 2024 Refresh', 'https://www.figma.com/design/honors-dashboard/Member-Portal-Refresh', 'https://www.hilton.com/en/hilton-honors/member/', 'pending', NULL, ''),
  ('60000003-aaaa-4bbb-cccc-dddddddddddd', 'e0f1a2b3-c4d5-4e6f-7a8b-9c0d1e2f3a4b', 'Request Access Form V2 Validation', 'https://www.figma.com/design/jl5gM84hdUjbyHo9lFpTUO/Hilton', 'https://hilton--qa.sandbox.my.site.com/s/request-access', 'pending', NULL, '')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  figma_url = EXCLUDED.figma_url,
  app_url = EXCLUDED.app_url;

COMMIT;

-- ============================================================
-- SUMMARY
-- ============================================================
-- Domain:            1 (Hospitality)
-- Projects:          4 (Hilton.com Booking, Honors Loyalty, Group Sales/RFP, Mobile App)
-- Applications:     11 (3 booking, 2 loyalty, 3 group sales, 3 mobile)
-- Test Suites:      13 (smoke, sprint, regression, integration, e2e, module)
-- Test Cases:       29 (booking 8, request access 10, loyalty 5, digital key 6)
-- Design Validations: 3 new + 1 linked existing
