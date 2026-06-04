# Vercel + Google Sheets Setup

This app lets you open the Vercel URL from iPhone, enter only an English word,
and save an AI-filled vocabulary row directly into Google Sheets.

Google Sheets becomes the source of truth for vocabulary data. GitHub is only for app code.

## Google Sheet Format

Create a sheet tab named `voca` with this header row:

```csv
word,meaning,example_sentence,example_translation,interval,ease_factor,repetitions,due_date,created_at
```

## Google Service Account

1. Create a Google Cloud service account.
2. Create a JSON key for that service account.
3. Share the Google Sheet with the service account email as an Editor.

The service account email looks like:

```text
something@project-id.iam.gserviceaccount.com
```

## Required Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables.

```text
OPENAI_API_KEY=sk-...
GOOGLE_SERVICE_ACCOUNT_EMAIL=something@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_SHEET_NAME=voca
```

Optional:

```text
OPENAI_MODEL=gpt-5.4-mini
ADD_WORD_SECRET=your-private-password
EXPORT_CSV_SECRET=your-private-password
```

If `ADD_WORD_SECRET` is set, enter the same password in the mobile web app before saving.

## Local Mac Sync

The local flashcard app can sync `voca.csv` from Google Sheets through the Vercel export API before it starts.

Create a local file named `.voca_cloud_url` in this project folder:

```text
https://voca-flash-card.vercel.app/api/export-csv
```

If you set `EXPORT_CSV_SECRET` or `ADD_WORD_SECRET`, include it as a query string:

```text
https://voca-flash-card.vercel.app/api/export-csv?secret=your-private-password
```

Then run `VOCA 실행.command`. It will download the latest cloud CSV into local `voca.csv` before starting the study app.

## Data Flow

```text
iPhone Vercel app
-> English word input
-> OpenAI fills meaning/example fields
-> Google Sheets row append
-> Local Mac app downloads /api/export-csv on startup
-> Local voca.csv updates automatically
```
