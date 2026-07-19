# Implementation Plan:

## Overview

Implementation plan for the Penthouse Drift RC track community platform. This is a greenfield Next.js 14+ (App Router) project hosted on Vercel with Upstash Redis, Google OAuth, SumUp payments, Facebook Graph API integration, QR code check-in, and PWA support.

## Tasks

- [ ] 1. Project Scaffolding and Configuration
  - [ ] 1.1. Initialize Next.js 14+ project with App Router, TypeScript, Tailwind CSS, and ESLint
  - [ ] 1.2. Install core dependencies: @upstash/redis, next-auth@beta (v5), zod, qrcode, @vercel/blob, @ducanh2912/next-pwa, html5-qrcode
  - [ ] 1.3. Create .env.example with all required environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, ADMIN_EMAILS, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, BLOB_READ_WRITE_TOKEN, SUMUP_API_KEY, SUMUP_MERCHANT_CODE, SUMUP_WEBHOOK_SECRET, FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN, CRON_SECRET, NEXT_PUBLIC_APP_URL)
  - [ ] 1.4. Configure next.config.ts with PWA plugin, image remote patterns for Vercel Blob and Facebook CDN
  - [ ] 1.5. Create src/types/index.ts with all TypeScript interfaces (Member, Membership, CheckIn, CarProfile, CalibrationSetup, CustomParam, ShellEntry, GearRatio, FacebookPost, ActionResult)
  - [ ] 1.6. Create src/lib/validators.ts with all Zod schemas (carProfileSchema, calibrationSchema, shellSubmissionSchema, gearRatioSchema, facebookPostSchema)
  - [ ] 1.7. Create vercel.json with cron job definitions for membership expiry (every minute) and Facebook feed sync (every 15 minutes)
- [ ] 2. Redis Client and Data Layer
  - [ ] 2.1. Create src/lib/redis.ts with Upstash Redis client configured with exponential backoff retry (initial 1s, doubling each attempt, max 30s, 5 attempts)
  - [ ] 2.2. Create Redis helper wrapper with 5-second timeout enforcement on write operations and consistent error handling returning ActionResult type
- [ ] 3. Authentication System
  - [ ] 3.1. Create src/lib/auth.ts with Auth.js v5 configuration: Google OAuth provider, JWT session strategy with 7-day maxAge, jwt callback for role assignment from ADMIN_EMAILS env var and member persistence to Redis on first login, session callback exposing id and role
  - [ ] 3.2. Create src/app/api/auth/[...nextauth]/route.ts exporting Auth.js route handlers
  - [ ] 3.3. Create middleware.ts with route protection: public routes (/, /auth/*), authenticated routes redirect unauthenticated users to /auth/signin, admin routes (/admin/*) redirect non-admin users to /dashboard, exclude _next/static, _next/image, favicon.ico, icons, api/webhooks from matching
  - [ ] 3.4. Create src/app/(public)/auth/signin/page.tsx with Google sign-in button and error message display for failed auth attempts
  - [ ] 3.5. Create src/types/next-auth.d.ts extending NextAuth types to include role on session.user and JWT token
- [ ] 4. Application Layout and Navigation
  - [ ] 4.1. Create src/app/layout.tsx root layout with Tailwind CSS, metadata (title: Penthouse Drift), session provider, and responsive viewport meta tag
  - [ ] 4.2. Create src/app/(public)/page.tsx landing page with hero section and sign-in CTA button
  - [ ] 4.3. Create src/app/(protected)/layout.tsx with responsive navigation: sidebar on desktop with links (Dashboard, My Cars, Showcase, Calculator, Newsfeed, Profile), bottom tab bar on mobile
  - [ ] 4.4. Create src/app/(admin)/layout.tsx with admin navigation extending protected layout: admin links (Members, Check-In, Showcase Winners, Facebook Publishing)
  - [ ] 4.5. Create shared UI components in src/components/ui/: StatusBadge (green active/red expired indicators), LoadingSpinner, ErrorMessage with retry button, ConfirmDialog modal
- [ ] 5. PWA Configuration
  - [ ] 5.1. Create src/app/manifest.ts returning Web App Manifest with name "Penthouse Drift", short_name "PHD", start_url "/dashboard", display "standalone", theme_color "#1a1a2e", background_color "#1a1a2e", and icons at 192x192 and 512x512
  - [ ] 5.2. Create placeholder PWA icon files in public/icons/ (icon-192.png, icon-512.png)
  - [ ] 5.3. Configure service worker caching via next-pwa: CacheFirst for blob-images (vercel-storage.com), NetworkFirst for API calls, precache app shell assets
  - [ ] 5.4. Create offline fallback component displaying cached app shell with offline indicator when network is unavailable
- [ ] 6. Member Dashboard
  - [ ] 6.1. Create src/actions/membership.ts with getMembership(userId) server action reading membership from Redis, computing active/expired status using isMembershipActive (expiresAt > Date.now()), and getRemainingDays using floor((expiresAt - now) / 86400000)
  - [ ] 6.2. Create src/app/(protected)/dashboard/page.tsx displaying: member name and avatar from session, membership status with green StatusBadge and "X days remaining" if active or red StatusBadge with renewal prompt linking to /membership/purchase if expired, QR code display, and quick links to features
- [ ] 7. QR Code Generation
  - [ ] 7.1. Create src/lib/qr.ts with generateQRCode(memberId) returning base64 data URL and generateQRCodeBuffer(memberId) returning PNG buffer, encoding JSON payload { memberId, version: 1 } with 300px width and 2px margin
  - [ ] 7.2. Implement QR code persistence: on profile access check Redis key qr:{memberId}, generate and store if missing, return cached value on subsequent access
  - [ ] 7.3. Create src/app/(protected)/profile/page.tsx showing member profile info, QR code image display, and download-as-PNG button
  - [ ] 7.4. Handle QR generation failure: display error message, retry generation on next profile access
- [ ] 8. Image Upload System
  - [ ] 8.1. Create src/app/api/upload/route.ts with Vercel Blob client upload handler: verify auth session, restrict to image/jpeg, image/png, image/webp content types, enforce 5MB maximum size
  - [ ] 8.2. Create src/lib/blob.ts with uploadImage(file, folder) and deleteImage(url) helper functions using @vercel/blob
  - [ ] 8.3. Create src/components/ui/ImageUploader.tsx client component with drag-and-drop zone, file type and size validation before upload, upload progress indicator, preview thumbnails, and error display for rejected files
- [ ] 9. Membership Purchase via SumUp
  - [ ] 9.1. Create src/lib/sumup.ts with createCheckout function calling SumUp POST /checkouts with checkout_reference, amount, currency, description, merchant_code, redirect_url, and metadata containing memberId
  - [ ] 9.2. Create src/app/(protected)/membership/purchase/page.tsx with membership details and purchase button that triggers checkout creation and redirects to SumUp hosted payment page
  - [ ] 9.3. Create src/app/api/webhooks/sumup/route.ts handling SumUp webhook: verify webhook signature using SUMUP_WEBHOOK_SECRET, extract payment status and memberId from metadata, if successful create/extend membership in Redis (new: expiresAt = now + 28 days, add to memberships:active sorted set; renewal: expiresAt = current expiresAt + 28 days), store payment reference
  - [ ] 9.4. Create src/app/(protected)/membership/success/page.tsx return URL page verifying membership is active and displaying confirmation with new expiry date
  - [ ] 9.5. Create src/app/(protected)/membership/cancelled/page.tsx showing payment cancelled message with option to retry purchase
- [ ] 10. Admin Membership Portal
  - [ ] 10.1. Create src/actions/admin/members.ts with getAllMembers() fetching all userId values from memberships:all sorted set, enriching with member profile data and membership status, sorting by status (active first) then expiration date ascending
  - [ ] 10.2. Create src/app/(admin)/admin/members/page.tsx displaying member list table with columns: name, email, status (green/red StatusBadge), expiration date, and actions (manual check-in button)
  - [ ] 10.3. Implement search input with case-insensitive partial match filtering on name or email, debounced to update within 1 second, showing "No results found" message when no matches
  - [ ] 10.4. Add manual check-in button per member row showing status indicator and confirmation dialog before recording check-in
- [ ] 11. QR Code Check-In (Admin Scanner)
  - [ ] 11.1. Create src/app/(admin)/admin/checkin/page.tsx with camera view using html5-qrcode library for browser-based QR scanning
  - [ ] 11.2. Create src/app/api/checkin/scan/route.ts POST handler: parse QR payload to extract memberId, look up member and membership in Redis, check dedup key (checkin:dedup:{userId}), if active and not duplicate record check-in entry and set dedup key with 3600s TTL, return member info and status
  - [ ] 11.3. Create full-screen check-in result display: green background with large "Active - Allowed on Track" text and member name for active members, red background with large "Expired - Renewal Required" text for expired members
  - [ ] 11.4. Handle edge cases: already checked in within 1 hour (show notice, don't record duplicate), invalid/unrecognized QR code (show error "Not associated with any member"), camera permission denied (prompt to grant access)
- [ ] 12. Manual Check-In (Admin)
  - [ ] 12.1. Create src/actions/checkin.ts with performCheckIn(memberId, adminId, method) server action: validate membership is active, check dedup, record check-in to Redis list checkins:{YYYY-MM-DD} and set dedup key, return ActionResult with success/error
  - [ ] 12.2. Integrate manual check-in flow in admin members page: click check-in button → show member status (green if active, red if expired with block message) → confirm button → record check-in → show success toast
- [ ] 13. Membership Expiry Cron Job
  - [ ] 13.1. Create src/app/api/cron/expire-memberships/route.ts: verify authorization header matches Bearer {CRON_SECRET}, query memberships:active sorted set for scores less than Date.now(), for each expired userId update membership hash status to "expired" and remove from memberships:active set, return count of expired memberships
  - [ ] 13.2. Add cron entry to vercel.json: path "/api/cron/expire-memberships" with schedule "* * * * *" (every minute)
- [ ] 14. Car Profile Management
  - [ ] 14.1. Create src/actions/cars.ts with CRUD server actions: createCar (validate with Zod, generate carId, store hash, add to member:{userId}:cars set, enforce 20 car limit), updateCar, deleteCar (with cascading delete of all calibrations via car:{carId}:calibrations set, delete images from Vercel Blob), getMemberCars
  - [ ] 14.2. Create src/app/(protected)/cars/page.tsx listing member's car profiles as cards with thumbnail image, car name, and calibration count badge
  - [ ] 14.3. Create src/app/(protected)/cars/new/page.tsx with form: car name input (1-50 chars validated), ImageUploader configured for 1-10 images, submit button calling createCar action
  - [ ] 14.4. Create src/app/(protected)/cars/[carId]/page.tsx detail view: image carousel/gallery, car name, list of calibration setups with edit/delete/share actions, add calibration button, edit car button, delete car button with ConfirmDialog
  - [ ] 14.5. Enforce 20 car limit: display error message when member attempts to create 21st car profile
- [ ] 15. Calibration Setup Management
  - [ ] 15.1. Create src/components/cars/CalibrationForm.tsx with fields: name (1-50 chars), camber (number input -15.0 to +15.0), toe (-10.0 to +10.0), caster (-15.0 to +15.0), boost (integer slider/input 0-100), dynamic custom parameters section (add/remove up to 10, each with name and value inputs)
  - [ ] 15.2. Create src/actions/calibration.ts with server actions: createCalibration (validate with Zod, generate calibrationId, store hash, add to car:{carId}:calibrations set, enforce 20 per car limit), updateCalibration, deleteCalibration (remove from set and delete hash), getCarCalibrations
  - [ ] 15.3. Display validation errors inline: field-specific messages for out-of-range values and missing required fields
  - [ ] 15.4. Display calibration list on car detail page as expandable cards showing all parameter values
- [ ] 16. Calibration Setup Sharing
  - [ ] 16.1. Add share actions to src/actions/calibration.ts: shareCalibration(calibrationId) generating unique shareId, storing share:{shareId} hash with calibrationId, userId, createdAt, active=true; revokeShare(shareId) setting active=false
  - [ ] 16.2. Create src/app/api/share/[shareId]/route.ts GET handler: verify auth (redirect to /auth/signin if not authenticated), check share exists and active=true, look up calibration/car/creator data, return 404-style page if share revoked or calibration deleted
  - [ ] 16.3. Create src/app/(protected)/share/[shareId]/page.tsx displaying shared calibration read-only: setup name, car profile name, creator display name, all standard parameters with labels, and custom parameters
  - [ ] 16.4. Add copy-shareable-link button and revoke-share button to calibration detail view on car profile page
- [ ] 17. Shell Showcase Gallery
  - [ ] 17.1. Create src/actions/showcase.ts with server actions: submitShell (validate with Zod, generate shellId, store hash with voteCount=0, add to shells:all sorted set with score=createdAt, add to shells:leaderboard with score=0), getShowcaseEntries (read from shells:all sorted set, fetch full data for each), deleteShell
  - [ ] 17.2. Create src/app/(protected)/showcase/page.tsx with responsive image gallery grid: each card shows shell image, truncated description, author name, vote count, submission date; ordered by newest first; toggle between gallery and leaderboard views
  - [ ] 17.3. Create src/app/(protected)/showcase/submit/page.tsx with form: single image upload (JPEG/PNG/WebP, max 5MB) via ImageUploader, optional description textarea (max 500 chars with character counter), submit button
- [ ] 18. Shell Showcase Voting
  - [ ] 18.1. Add toggleVote(shellId, userId) to src/actions/showcase.ts: check if shellId author equals userId (reject self-vote), check shell:{shellId}:voters set for userId, if present remove vote (SREM from voters, decrement voteCount in hash, update leaderboard score), if absent add vote (SADD to voters, increment voteCount, update leaderboard score)
  - [ ] 18.2. Create vote button component: disabled/hidden on own entries, shows filled icon if user has voted, outline icon if not, displays current vote count; on click calls toggleVote action
  - [ ] 18.3. Create leaderboard view accessible from showcase page: entries sorted by vote count descending, tiebreaker by earlier submission date (use composite score or secondary sort in application layer)
- [ ] 19. Shell Showcase Weekly Winners (Admin)
  - [ ] 19.1. Create src/actions/admin/showcase.ts with selectWeeklyWinner(shellId): calculate current ISO calendar week (Monday-Sunday), check shells:winner:{year}:{week} key, if same shellId return "already winner" message, if different shellId replace (remove badge from old, set badge on new), if no winner yet just set; store winner in shells:winners sorted set
  - [ ] 19.2. Create src/app/(admin)/admin/showcase/page.tsx listing shell entries with "Select as Winner" button for each, showing current week's winner highlighted
  - [ ] 19.3. Add winners section to member showcase page: dedicated area showing past weekly winners with badge, week/year label, ordered by award week descending (most recent first)
- [ ] 20. Gear Ratio Calculator
  - [ ] 20.1. Create src/lib/calculator.ts with computeGearRatio(spur, pinion) returning Math.round((spur / pinion) * 100) / 100, and validateGearInput(spur, pinion) returning { valid: boolean, errors: string[] } checking integer type and ranges (spur 30-130, pinion 10-60)
  - [ ] 20.2. Create src/app/(protected)/calculator/page.tsx with two number inputs (spur, pinion), real-time ratio display that updates within 200ms of last keystroke using debounce, validation error messages showing permitted ranges
  - [ ] 20.3. Add "Save to Car Profile" feature: dropdown to select car profile, save button storing { spur, pinion, ratio } to car:{carId}:ratios list in Redis; if no car profiles exist show prompt to create one first
- [ ] 21. Facebook Feed Integration (Read)
  - [ ] 21.1. Create src/lib/facebook.ts with getPageFeed(limit=20) calling Facebook Graph API v19+ GET /{pageId}/feed with fields=message,created_time,full_picture,attachments, using FACEBOOK_PAGE_ACCESS_TOKEN
  - [ ] 21.2. Create src/app/api/cron/facebook-sync/route.ts: verify CRON_SECRET, call getPageFeed, store result as JSON string in Redis key facebook:feed with timestamp in facebook:feed:updated, add cron to vercel.json running every 15 minutes
  - [ ] 21.3. Create src/app/api/facebook/feed/route.ts GET handler: read facebook:feed from Redis (cached data), return parsed posts array; if cache miss trigger direct API call and cache result
  - [ ] 21.4. Create src/app/(protected)/newsfeed/page.tsx displaying up to 20 posts as cards: text content truncated to 500 chars with "...Read more on Facebook" indicator if longer, images, publication date formatted; handle unsupported content with "Additional content available on Facebook" note
  - [ ] 21.5. Handle Facebook API errors gracefully: if API unavailable display cached posts with banner notice "Feed may not reflect latest updates"
- [ ] 22. Facebook Post Publishing (Admin)
  - [ ] 22.1. Create src/lib/facebook.ts publishPost(message, imageUrls?) function: if images provided upload as unpublished photos first then create multi-photo post, otherwise create text-only post via POST /{pageId}/feed
  - [ ] 22.2. Create src/app/(admin)/admin/facebook/page.tsx with post composition form: text textarea (max 63,206 chars with counter), image upload section (up to 4 images, JPEG/PNG only, max 4MB each), preview panel showing composed post, and publish button
  - [ ] 22.3. Create src/app/api/facebook/publish/route.ts POST handler: verify admin auth, validate with facebookPostSchema, call publishPost, return success with post ID or error with failure reason
  - [ ] 22.4. Implement error handling: on publish failure retain post content in form (editable draft state), display Facebook API error reason, allow modify and resubmit; on success show confirmation with option to compose another
- [ ] 23. Responsive Design and Mobile Optimization
  - [ ] 23.1. Implement mobile-first responsive layouts for all pages: 320px to 2560px with no horizontal scrolling, breakpoints at sm(640px), md(768px), lg(1024px), xl(1280px)
  - [ ] 23.2. Optimize admin check-in page for tablet: large full-screen status indicators, camera viewfinder sized for easy scanning, minimal UI during scan flow
  - [ ] 23.3. Ensure all interactive elements (buttons, links, form inputs) have minimum 44x44px touch targets on mobile
  - [ ] 23.4. Test and optimize image galleries, voting interactions, and form inputs for touch devices

## Task Dependency Graph

```json
{
  "waves": [
    { "tasks": [1], "description": "Project scaffolding and configuration" },
    { "tasks": [2, 5], "description": "Redis client, data layer, and PWA configuration" },
    { "tasks": [3], "description": "Authentication system" },
    { "tasks": [4, 8], "description": "Application layout and image upload system" },
    { "tasks": [6], "description": "Member dashboard with membership status" },
    { "tasks": [7, 9, 10, 13], "description": "QR code generation, SumUp payments, admin membership portal, and cron job" },
    { "tasks": [11, 12, 14, 17, 20, 21, 22], "description": "Check-in flows, car profiles, showcase gallery, calculator, and Facebook integration" },
    { "tasks": [15, 18, 19], "description": "Calibration management, voting, and weekly winners" },
    { "tasks": [16], "description": "Calibration sharing" },
    { "tasks": [23], "description": "Responsive design and mobile optimization" }
  ]
}
```

## Notes

- All tasks assume environment variables will be configured in Vercel project settings for production and in .env.local for local development
- Upstash Redis free tier supports the development workload; upgrade to Pro for production traffic
- SumUp webhook testing requires a publicly accessible URL (use Vercel preview deployments or ngrok for local development)
- Facebook Graph API requires a Facebook App with pages_read_engagement and pages_manage_posts permissions, and a long-lived Page Access Token
- PWA icons should be replaced with proper branded icons before production launch
- The html5-qrcode library provides browser-based camera access for QR scanning without native dependencies
