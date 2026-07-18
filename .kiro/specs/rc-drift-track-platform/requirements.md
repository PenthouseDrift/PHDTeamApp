# Requirements Document

## Introduction

Penthouse Drift is a web application and Progressive Web App (PWA) for managing an RC drift track community. The platform provides membership management with QR code check-in, a member car showcase with calibration sharing, shell showcase voting, a gear ratio calculator, and Facebook page integration. The application is built with Next.js, hosted on Vercel, uses Google Authentication, stores data in Redis, and integrates with SumUp for payments.

## Glossary

- **Platform**: The Penthouse Drift web application accessible via desktop browser or mobile PWA
- **Member**: A registered user who has authenticated via Google and may hold an active membership
- **Admin**: A user with elevated privileges who manages memberships, content, and track operations
- **Membership**: A 4-week access pass that grants a Member permission to use the RC drift track
- **QR_Code**: A unique scannable code assigned to each Member for check-in identification
- **Check_In**: The process of scanning or manually recording a Member's arrival at the track
- **Car_Profile**: A Member's uploaded RC drift car entry containing images and calibration data
- **Calibration_Setup**: A named set of car tuning parameters (camber, toe, caster, boost, etc.) attached to a Car_Profile
- **Shell_Showcase**: A gallery where Members submit their RC car shell designs for community voting and Admin-selected weekly winners
- **Gear_Ratio_Calculator**: A tool that computes gear ratios based on user-provided drivetrain parameters
- **SumUp**: A third-party payment processing service used for online membership purchases
- **Facebook_Integration**: The connection between the Platform and the associated Facebook page for reading and posting content
- **Newsfeed**: The in-app content feed displaying Facebook posts and Platform announcements

## Requirements

### Requirement 1: User Authentication

**User Story:** As a user, I want to sign in with my Google account, so that I can securely access the platform without creating a separate username and password.

#### Acceptance Criteria

1. WHEN a user initiates sign-in, THE Platform SHALL present a Google OAuth sign-in option as the sole authentication method
2. WHEN a user successfully authenticates via Google, THE Platform SHALL create a session and redirect the user to the member dashboard
3. WHEN a user signs out, THE Platform SHALL terminate the session and redirect to the public landing page
4. THE Platform SHALL assign one of two roles to each authenticated user: Member (default) or Admin (configured via an admin allow-list of Google email addresses)
5. IF Google OAuth authentication fails or is rejected, THEN THE Platform SHALL display an error message indicating the sign-in could not be completed and return the user to the sign-in page
6. WHEN a session remains inactive for more than 7 days, THE Platform SHALL expire the session and require the user to re-authenticate

### Requirement 2: Admin Membership Management

**User Story:** As an Admin, I want to view and manage all memberships, so that I can track who has active access to the track.

#### Acceptance Criteria

1. WHEN an Admin accesses the membership portal, THE Platform SHALL display a list of all Members showing their name, email, membership status (active or expired), and membership expiration date, sorted by status (active first) then by expiration date ascending
2. WHILE a Membership is active, THE Platform SHALL display a green status indicator next to the Member's name
3. WHILE a Membership is expired, THE Platform SHALL display a red status indicator next to the Member's name
4. WHEN an Admin searches for a Member, THE Platform SHALL filter the membership list by case-insensitive partial match on name or email and display results within 1 second
5. IF a search returns no matching Members, THEN THE Platform SHALL display a message indicating no results were found
6. THE Platform SHALL display the membership expiration date for each Member in the membership list

### Requirement 3: QR Code Generation and Assignment

**User Story:** As a Member, I want to receive a unique QR code, so that I can quickly check in at the track.

#### Acceptance Criteria

1. WHEN a Member completes registration, THE Platform SHALL generate a unique QR_Code encoding the Member's unique identifier and persist it in Redis for the lifetime of the Member's account
2. THE Platform SHALL make the QR_Code available for display within the Member's profile and for download as a PNG image
3. THE Platform SHALL ensure each QR_Code uniquely identifies exactly one Member and that the same QR_Code is returned on every subsequent access by that Member
4. IF QR_Code generation fails during registration, THEN THE Platform SHALL display an error message indicating the QR code could not be created and SHALL retry generation on the Member's next profile access

### Requirement 4: QR Code Check-In

**User Story:** As an Admin, I want to scan a Member's QR code, so that I can quickly verify their membership status and check them in.

#### Acceptance Criteria

1. WHEN an Admin scans a Member's QR_Code, THE Platform SHALL retrieve and display that Member's name, profile image, and membership status (active or expired) within 3 seconds of the scan
2. WHILE the scanned Member's Membership is active, THE Platform SHALL display a green confirmation indicator with the text "Active - Allowed on Track"
3. WHILE the scanned Member's Membership is expired, THE Platform SHALL display a red warning indicator with the text "Expired - Renewal Required" and SHALL NOT record a Check_In entry
4. WHEN an Admin scans a valid QR_Code for a Member with active Membership, THE Platform SHALL record a Check_In entry with the Member ID, Admin ID, current timestamp, and method "qr", and SHALL display a confirmation message indicating successful check-in
5. IF an unrecognised or invalid QR_Code is scanned, THEN THE Platform SHALL display an error message indicating the code is not associated with any Member
6. IF an Admin scans the same Member's QR_Code more than once within a 1-hour window, THEN THE Platform SHALL display a notice indicating the Member has already been checked in and SHALL NOT record a duplicate Check_In entry

### Requirement 5: Manual Check-In

**User Story:** As an Admin, I want to manually check in a Member, so that I can accommodate situations where QR scanning is not possible.

#### Acceptance Criteria

1. WHEN an Admin selects a Member from the membership list, THE Platform SHALL provide a manual check-in action button
2. WHEN an Admin confirms a manual Check_In for a Member with active Membership, THE Platform SHALL record the Check_In entry with the Member ID, Admin ID, current timestamp, and method "manual", and display a green success confirmation
3. WHILE a manually selected Member's Membership is expired, THE Platform SHALL display the red expiry warning and SHALL NOT allow check-in
4. WHILE a manually selected Member's Membership is active, THE Platform SHALL display the green active indicator before the Admin confirms check-in

### Requirement 6: Membership Duration and Expiry

**User Story:** As a Member, I want my membership to last 4 weeks from purchase, so that I have a clear access window.

#### Acceptance Criteria

1. WHEN a Membership is purchased, THE Platform SHALL set the expiration date to exactly 4 weeks (28 days) from the purchase timestamp, calculated to the exact second
2. WHEN a Membership expiration date passes, THE Platform SHALL update the Member's status to expired within 1 minute of the expiration time
3. THE Platform SHALL display the remaining days of membership within the Member's dashboard, rounded down to the nearest whole day (e.g., 6 days 23 hours displays as "6 days remaining")
4. WHILE a Membership is expired, THE Platform SHALL display a renewal prompt on the Member's dashboard with a link to purchase a new membership
5. WHEN a Member renews their Membership while a current Membership is still active, THE Platform SHALL extend the expiration date by 28 days from the current expiration date

### Requirement 7: Online Membership Purchase via SumUp

**User Story:** As a user, I want to purchase a 1-month membership online, so that I can secure track access ahead of time.

#### Acceptance Criteria

1. WHEN a Member selects the purchase membership option, THE Platform SHALL redirect to a SumUp payment flow for a 1-month membership
2. WHEN SumUp confirms a successful payment for a Member with no active Membership, THE Platform SHALL activate a new 4-week Membership starting from the payment timestamp
3. WHEN SumUp confirms a successful payment for a Member with an active Membership, THE Platform SHALL extend the Membership by adding 28 days to the current expiration date
4. IF a SumUp payment fails or is cancelled, THEN THE Platform SHALL display an error message indicating the payment was not completed and the Membership SHALL remain unchanged
5. THE Platform SHALL store a payment reference from SumUp against the Member's Membership record

### Requirement 8: Car Profile Management

**User Story:** As a Member, I want to create profiles for my RC drift cars, so that I can showcase them and track their setups.

#### Acceptance Criteria

1. WHEN a Member creates a new Car_Profile, THE Platform SHALL require the Member to provide a car name between 1 and 50 characters and upload between 1 and 10 images, each no larger than 5 MB and in JPEG, PNG, or WebP format
2. THE Platform SHALL allow a Member to create up to 20 Car_Profiles
3. WHEN a Member edits a Car_Profile, THE Platform SHALL save the updated information to Redis
4. WHEN a Member initiates deletion of a Car_Profile, THE Platform SHALL present a confirmation prompt before removing the Car_Profile and all associated Calibration_Setups from Redis
5. IF an image upload fails during Car_Profile creation or editing, THEN THE Platform SHALL display an error message indicating the upload failure and the Car_Profile SHALL NOT be saved until all images are successfully uploaded

### Requirement 9: Calibration Setup Management

**User Story:** As a Member, I want to attach calibration setups to my cars, so that I can record and share my tuning configurations.

#### Acceptance Criteria

1. WHEN a Member adds a Calibration_Setup to a Car_Profile, THE Platform SHALL store the following parameters: camber angle (decimal degrees, range -15.0 to +15.0), toe angle (decimal degrees, range -10.0 to +10.0), caster angle (decimal degrees, range -15.0 to +15.0), and boost level (integer percentage, range 0 to 100)
2. THE Platform SHALL allow a Member to attach up to 20 Calibration_Setups to a single Car_Profile
3. WHEN a Member names a Calibration_Setup, THE Platform SHALL save it with a label between 1 and 50 characters in length
4. THE Platform SHALL allow Members to add up to 10 custom parameters per Calibration_Setup, each with a parameter name (1 to 30 characters) and a text value (1 to 30 characters)
5. IF a Member submits a Calibration_Setup with any parameter value outside its permitted range or with a missing required field, THEN THE Platform SHALL display a validation error message indicating which parameter is invalid and SHALL NOT save the Calibration_Setup

### Requirement 10: Calibration Setup Sharing

**User Story:** As a Member, I want to share my calibration setups with other Members, so that we can learn from each other's configurations.

#### Acceptance Criteria

1. WHEN a Member shares a Calibration_Setup, THE Platform SHALL generate a shareable link accessible only to authenticated Members; IF an unauthenticated user accesses the link, THEN THE Platform SHALL redirect to the sign-in page
2. WHEN a Member views a shared Calibration_Setup, THE Platform SHALL display the setup name, associated Car_Profile name, creator's display name, and all stored parameters in a read-only format
3. THE Platform SHALL attribute each shared Calibration_Setup to the original Member who created it by displaying the creator's name
4. IF a shared link references a Calibration_Setup that has been deleted, THEN THE Platform SHALL display a message indicating the setup is no longer available
5. WHEN a Member who owns a shared Calibration_Setup revokes the share, THE Platform SHALL invalidate the shareable link so subsequent access returns a "no longer available" message

### Requirement 11: Shell Showcase Gallery

**User Story:** As a Member, I want to submit my RC car shell designs to a showcase gallery, so that I can display my work to the community.

#### Acceptance Criteria

1. WHEN a Member submits a shell to the Shell_Showcase, THE Platform SHALL accept one image upload (JPEG, PNG, or WebP format, no larger than 5 MB) and an optional description of up to 500 characters
2. THE Platform SHALL display all Shell_Showcase submissions in a gallery view accessible to all authenticated users, ordered by submission date (newest first)
3. WHEN a Member views the Shell_Showcase, THE Platform SHALL display each entry's image, description, author name, vote count, and submission date
4. IF an image upload fails during submission, THEN THE Platform SHALL display an error message and the submission SHALL NOT be saved

### Requirement 12: Shell Showcase Voting

**User Story:** As a Member, I want to vote on shell showcase entries, so that the community can recognise the best designs.

#### Acceptance Criteria

1. WHEN a Member casts a vote on a Shell_Showcase entry, THE Platform SHALL increment that entry's vote count by one and visually indicate that the Member has voted on that entry
2. THE Platform SHALL allow each Member to vote only once per Shell_Showcase entry; IF a Member attempts to vote on an entry they have already voted for, THEN THE Platform SHALL remove the vote (toggle behaviour) and decrement the count by one
3. THE Platform SHALL NOT allow a Member to vote on their own Shell_Showcase entry
4. THE Platform SHALL display a ranked leaderboard of Shell_Showcase entries sorted by vote count in descending order; WHERE two entries have equal vote counts, THE Platform SHALL sort them by submission date with the earlier submission ranked higher

### Requirement 13: Shell Showcase Admin Weekly Winners

**User Story:** As an Admin, I want to select weekly winners from the shell showcase, so that we can highlight outstanding designs.

#### Acceptance Criteria

1. WHEN an Admin selects a Shell_Showcase entry as a weekly winner, THE Platform SHALL mark that entry with a winner badge and the calendar week number and year it was awarded, where a week is defined as Monday 00:00 to Sunday 23:59 in the Platform's configured timezone
2. THE Platform SHALL display a dedicated section for past weekly winners accessible from the Shell_Showcase page, ordered by award week in descending order (most recent first)
3. THE Platform SHALL allow at most one Admin-selected winner per calendar week
4. IF an Admin selects a new winner during the same calendar week in which a winner has already been designated, THEN THE Platform SHALL replace the previous winner for that week, removing the winner badge from the prior entry and applying it to the newly selected entry
5. IF an Admin attempts to select as weekly winner a Shell_Showcase entry that is already the current week's winner, THEN THE Platform SHALL display a message indicating that entry is already the winner for the current week and take no further action

### Requirement 14: Gear Ratio Calculator

**User Story:** As a Member, I want to calculate gear ratios for my RC car, so that I can optimise my drivetrain setup.

#### Acceptance Criteria

1. WHEN a Member inputs spur gear teeth count (integer, range 30 to 130) and pinion gear teeth count (integer, range 10 to 60), THE Gear_Ratio_Calculator SHALL compute and display the final drive ratio as spur teeth divided by pinion teeth, rounded to two decimal places
2. WHILE a Member is editing either input field, THE Gear_Ratio_Calculator SHALL recompute and update the displayed result within 200 milliseconds of the last keystroke
3. IF a Member enters a non-numeric, zero, or out-of-range value, THEN THE Gear_Ratio_Calculator SHALL display a validation error message indicating the permitted range and SHALL NOT display a ratio result
4. WHEN a Member saves a calculated ratio to a Car_Profile, THE Platform SHALL store the spur teeth count, pinion teeth count, and computed ratio against the selected Car_Profile
5. IF a Member attempts to save a ratio and has no Car_Profiles, THEN THE Platform SHALL display a prompt to create a Car_Profile first

### Requirement 15: Facebook Feed Integration (Read)

**User Story:** As a Member, I want to see the track's Facebook posts within the app, so that I can stay updated without leaving the platform.

#### Acceptance Criteria

1. THE Platform SHALL retrieve and display up to the 20 most recent posts from the configured Facebook page within the Newsfeed section, ordered from newest to oldest by publication date
2. WHEN a new post is published on the Facebook page, THE Platform SHALL display it in the Newsfeed within 15 minutes
3. THE Platform SHALL display each Facebook post's text content (up to 500 characters, with a truncation indicator if longer), images (up to 10 per post), and publication date in the Newsfeed
4. IF the Facebook API is unavailable or returns an error, THEN THE Platform SHALL display the most recently cached posts and show a notice indicating that the feed may not reflect the latest updates
5. IF a Facebook post contains content types not supported for display (such as video or polls), THEN THE Platform SHALL display the post's text content and publication date with an indicator that additional content is available on Facebook

### Requirement 16: Facebook Post Publishing (Write)

**User Story:** As an Admin, I want to publish posts to the Facebook page from the app, so that I can manage social media content without switching platforms.

#### Acceptance Criteria

1. WHEN an Admin composes and submits a post, THE Platform SHALL publish that content to the configured Facebook page via the Facebook Graph API
2. WHEN the Facebook API confirms successful publication, THE Platform SHALL display a success confirmation to the Admin within 3 seconds of receiving the response
3. IF the Facebook API returns an error, THEN THE Platform SHALL display an error message indicating the failure reason and THE Platform SHALL retain the post content in an editable draft state so the Admin can modify and resubmit without recomposing
4. THE Platform SHALL support text content up to 63,206 characters and up to 4 images per post, where each image must be in JPEG or PNG format and no larger than 4MB in file size
5. IF an Admin submits a post with text exceeding 63,206 characters, no text content, or images that exceed the size or format constraints, THEN THE Platform SHALL display a validation error identifying the violated constraint and SHALL NOT submit the post to the Facebook API
6. WHEN an Admin is composing a post, THE Platform SHALL display a preview of the post content before submission, allowing the Admin to confirm or cancel the publish action

### Requirement 17: Progressive Web App Support

**User Story:** As a user, I want to install the app on my mobile device, so that I can access it like a native application.

#### Acceptance Criteria

1. THE Platform SHALL serve a Web App Manifest containing at minimum: name, short_name, start_url, display set to "standalone", theme_color, and icons at 192x192px and 512x512px sizes
2. THE Platform SHALL register a Service Worker that caches the application shell (HTML, CSS, JavaScript bundles, and app icons) to enable offline loading of the app shell within 3 seconds on subsequent visits
3. WHEN a user installs the PWA, THE Platform SHALL be launchable from the device home screen in standalone display mode with the configured icon and splash screen
4. THE Platform SHALL be responsive on screen widths from 320px to 2560px such that all interactive elements remain accessible and no horizontal scrolling is required at any supported width
5. IF the device has no network connection, THEN THE Platform SHALL display a cached app shell with an offline indicator informing the user that data-dependent content is unavailable until connectivity is restored

### Requirement 18: Data Persistence in Redis

**User Story:** As a developer, I want all application data stored in Redis, so that we have fast, consistent data access across the platform.

#### Acceptance Criteria

1. THE Platform SHALL store Member profiles, Memberships, Car_Profiles, Calibration_Setups, Shell_Showcase entries, votes, and Check_In records in Redis
2. WHEN data is written to Redis, THE Platform SHALL confirm the write operation succeeded before acknowledging to the user; IF a write operation does not complete within 5 seconds, THEN THE Platform SHALL treat it as failed and display a timeout error
3. IF a Redis connection fails, THEN THE Platform SHALL retry with exponential backoff (initial delay 1 second, maximum delay 30 seconds, maximum 5 attempts) and display a service unavailability message if all retries are exhausted
4. IF a Redis read operation fails, THEN THE Platform SHALL display an error message indicating the requested data could not be loaded and provide a retry option to the user
5. THE Platform SHALL NOT set implicit TTL (time-to-live) values on stored data unless explicitly specified by a feature requirement; data SHALL persist indefinitely until explicitly deleted
