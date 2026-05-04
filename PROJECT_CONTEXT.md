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
- Open friend and request profiles from the connection management cards
- Search for people by username and open matching profiles before sending a connection request

### Chat / CircleChat
Chat supports:
- Normal text messages
- Image attachments from the user's computer, with optional text captions, in both direct messages and CircleChat; chat images do not have an app-enforced file size cap
- Pasting an image into the compose or edit textarea attaches it as the message image
- Message bubble actions are grouped under a three-dot menu
- Image messages include a copy action in the three-dot menu that copies the attachment back to the clipboard when the browser allows it
- A user's own messages include edit and delete actions in the three-dot menu; editing supports updating the text, replacing the attached image, or removing the attached image
- Direct messages and CircleChat can be expanded for a wider message reading view, then minimized back to the standard layout
- Emoji shortcuts using `:emoji_name:` format
  - Example: `:smile:` becomes 😄

### Feedback
Users can:
- Submit feedback by type, severity, page, feature, specific location, and message
- Attach or paste up to five images to feedback
- Allow or decline developer follow-up contact
- Send feedback to the developer by email through Resend when feedback email environment variables are configured

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
Supports text, emoji shortcodes, pasted images, and image attachments from the user's computer without an app-enforced file size cap. Users can expand CircleChat for a wider message reading view. Message actions are grouped under a three-dot menu where users can copy image attachments, edit their own CircleChat messages, or delete their own CircleChat messages.

## Authentication
Supports:
- Email/password account creation
- Google account creation/sign-in

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
- Current task: Moved chat message actions into a three-dot menu for direct messages and CircleChat.
- Recently changed files: Shared message action menu; direct message panel; Circle room panel; project context.
- Known bugs: None known from this pass; lint and production build still need to be rerun after this menu change.
- Next steps: Browser-review message action menus for text-only and image messages in both direct messages and CircleChat.

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
