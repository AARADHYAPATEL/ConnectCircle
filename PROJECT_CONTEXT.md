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

## Main Sections
### Homepage
Central hub where users can access:
- Personal check-ins
- Friends
- Circles
- Circle Rooms
- CircleChat

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

### Chat / CircleChat
Chat supports:
- Normal text messages
- Emoji shortcuts using `:emoji_name:` format
  - Example: `:smile:` becomes 😄

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
- Current task:
- Recently changed files:
- Known bugs:
- Next steps:

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