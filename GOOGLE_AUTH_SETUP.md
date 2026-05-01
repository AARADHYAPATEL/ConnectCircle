# Google Sign-In Setup

Create a Google OAuth Client for a web application in Google Cloud Console.

Use this authorized redirect URI for local development:

```txt
http://localhost:3000/api/auth/google/callback
```

Then create `.env.local` in the project root:

```txt
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
CONNECTCIRCLE_SESSION_SECRET=replace-this-with-a-long-random-string
```

Restart the dev server after changing `.env.local`.
