# ConnectCircle Project Context

## Overview
ConnectCircle is a Next.js app for emotional check-ins and supportive social connection.

## Core Features
Users can:
- Create an account with email/password
- Sign in with Google
- Access everything from the homepage
- Create personal feeling check-ins
- View/manage personal check-ins
- Add/manage friends/connections
- Create/join Circles
- Open Circle Rooms for each Circle
- View each Circle’s details inside its Circle Room
- Use CircleChat, the group chat inside Circle Rooms
- View and edit basic profile identity details
- View other users' profiles from people search and connection lists, with each profile honoring its owner's visibility and availability settings
- Report other users from profiles, direct messages, and CircleChat messages
- Report accepted friends from the Friends action menu

## Main Sections
### Homepage
Central hub where users can access:
- Personal check-ins
- Friends
- Circles
- Circle Rooms
- CircleChat

### Profile
Users can:
- View their display name, username, avatar, bio, and joined date
- Edit their display name, profile image from their computer, and bio
- Manage whether profile details are visible to everyone, friends only, or only themselves
- Manage availability status and light/dark/system theme preferences
- Open their profile from the header avatar
- Preview their own profile details from the header avatar hover/focus popover, then open the full profile page
- Open another user's profile from people search, incoming requests, sent invitations, friends, and blocked users
- See another user's display name, avatar, bio, joined date, connected-since date, and availability only when that user's visibility rules allow it
- See a limited profile state when the owner is private, friends-only without an accepted friendship, or blocked

### Personal Check-ins
Users can:
- Create feeling/mood check-ins
- View previous check-in entries
- Delete their own check-in entries

### Friends
Users can:
- View existing friends
- Remove friends
- Block friends/users
- Manage blocked users from a three-dot menu with unblock, remove, and report actions; remove hides the user from the visible blocked-users list while keeping the block active
- Open friend and request profiles from the connection management cards
- Search for people by username and open matching profiles before sending a connection request

### Chat / CircleChat
Chat supports:
- Normal text messages
- Image and video attachments from the user's computer, with optional text captions, in both direct messages and CircleChat; chat media does not have an app-enforced file size cap
- Pasting an image or video into the compose or edit textarea attaches it as the message media when the browser exposes the pasted file
- Message bubble actions are grouped under a three-dot menu
- Image and video messages include a copy action in the three-dot menu that copies the attachment back to the clipboard when the browser allows it
- A user's own messages include edit and delete actions in the three-dot menu; editing supports updating the text, replacing the attached image/video, or removing the attachment
- Other users' messages include a report action in the three-dot menu; report submissions are private and store a message text/media metadata snapshot for moderator review
- Direct messages and CircleChat can be expanded for a wider message reading view, then minimized back to the standard layout
- Emoji shortcuts using `:emoji_name:` format
  - Example: `:smile:` becomes 😄

### Feedback
Users can:
- Submit feedback by type, severity, page, feature, specific location, and message
- Attach or paste up to five images to feedback
- Allow or decline developer follow-up contact
- Send feedback to the developer by email through Resend when feedback email environment variables are configured

### Reports / Safety
Users can:
- Report another user's profile from a dedicated `/people/[username]/report` page opened from the public profile page
- Report an accepted friend from the Friends action menu, which opens that same dedicated report page
- Report another user's direct message from the message actions menu
- Report another user's CircleChat message from the message actions menu
- Choose a report reason and optionally add details

Reports are stored privately in `.data/reports.json` with reporter, reported user, reason, context, timestamp, status, and message text/media metadata snapshots for message reports. Duplicate open/reviewing reports from the same reporter for the same context are blocked.

### Admin Safety Review
Admins can:
- Sign in through the separate `/admin/login` page with an admin account, not a student account
- View all submitted reports from `/admin/reports`
- Open a report detail page at `/admin/reports/[reportId]`
- Review reporter, reported user, reason, context, message snapshot, media metadata, and timestamps
- Change report status between open, reviewing, resolved, and dismissed
- Add an internal resolution note
- Download each report as a `.txt` file for offline review or record keeping

Admin access is intentionally separate from student access. Admin users are stored in `.data/admin-users.json` with scrypt password hashes, and the first admin account is bootstrapped from environment variables:
- `CONNECTCIRCLE_ADMIN_USERNAME`
- `CONNECTCIRCLE_ADMIN_PASSWORD`
- `CONNECTCIRCLE_ADMIN_SESSION_SECRET`

Admin sessions use a separate signed cookie from normal student sessions, and admin login attempts are rate limited through `.data/admin-login-attempts.json`.

### Friends
A section for managing personal connections.

### Circles
Groups where users connect around shared support/community.

### Circle Rooms
Dedicated pages/spaces for each Circle.
Each Circle Room contains:
- Circle details
- Members/details
- CircleChat

### CircleChat
Group chat inside a Circle Room.
Supports text, emoji shortcodes, pasted images/videos, and image/video attachments from the user's computer without an app-enforced file size cap. Users can expand CircleChat for a wider message reading view. Message actions are grouped under a three-dot menu where users can report other users' CircleChat messages, copy media attachments, edit their own CircleChat messages, or delete their own CircleChat messages.

## Authentication
Supports:
- Email/password account creation
- Google account creation/sign-in
- Separate admin authentication for the safety review area

Student user accounts use durable Postgres storage when `DATABASE_URL` or `POSTGRES_URL` is configured, with `.data/users.json` kept as a local-development fallback. Production/Vercel should set `CONNECTCIRCLE_REQUIRE_DATABASE=true` so the app fails closed instead of silently writing user accounts to local files. Password accounts are stored as salted scrypt hashes with versioned password algorithm metadata; legacy local hashes are still accepted and upgraded after successful login. Student password login attempts are throttled after repeated failures.

Do not assume the auth library until checking the project files.

## Codex Instructions
Before modifying code:
1. Read this file first.
2. Inspect the relevant files.
3. Do not assume folder structure, database schema, or auth setup.
4. Explain what files need changes before editing.
5. After edits, summarize changes and update this file if needed.

## Current Development State
Fill in:
- Current task: Investigated missing production direct messages and moved direct chat storage behind durable Postgres when configured, while keeping local JSON fallback for development.
- Recently changed files: User account type/store helpers; auth store password hashing/storage path; Postgres users and connection schemas; direct chat store; local user/connection/chat migration scripts; production auth storage guide; package dependencies/scripts; environment example; project context.
- Known bugs: Direct messages were previously stored only in `.data/chat-messages.json`, which is not durable/shared on Vercel. Chat storage now supports Postgres, but production history still needs `npm run migrate:chat` against the production database before deployed users can see migrated old messages.
- Next steps: Configure a Vercel Marketplace Postgres database, set `DATABASE_URL` or `POSTGRES_URL`, run `npm run migrate:users`, `npm run migrate:connections`, and `npm run migrate:chat`, then migrate remaining `.data` stores before real production.

## File Map
Fill in after scanning repo:
- Homepage:
- Auth:
- Personal check-ins:
- Friends:
- Circles:
- Circle Rooms:
- CircleChat:
- Database/schema:
- Shared components:
- Styling:

1. Open and explore http://localhost:3000 like a user.
2. Then scan the codebase.

Check whether PROJECT_CONTEXT.md mentions all major visible features, pages, sections, auth flows, buttons, and important interactions.

Do not modify code yet. Just list:
1. Features already covered
2. Missing features/details
3. Suggested updates to PROJECT_CONTEXT.md
