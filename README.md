# Voice Agent for Emails

## Getting Started

This project requires both Supabase and Next.js to be running simultaneously.

### Starting Supabase

1. Navigate to the `supabase` folder:
   ```bash
   cd supabase
   ```

2. Start Supabase:
   ```bash
   supabase start
   ```

### Starting Next.js

1. Navigate to the `webapp` folder:
   ```bash
   cd webapp
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

### Running Both Services

You'll need to run both services in separate terminal windows/tabs:

- **Terminal 1**: Run Supabase (from the `supabase` folder)
- **Terminal 2**: Run Next.js (from the `webapp` folder)

Once both are running, you can access the Next.js application at `http://localhost:3000` (or the port specified in your Next.js configuration).


# Getting the Grant ID
1. Go to the Nylas Developer Dashboard
2. Click on "Grants" under "Manage"
3. Click on "Create Grant" with the email you want to use for the grant