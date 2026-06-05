# Vercel + Google Sheets Setup

This app lets you study flashcards from iPhone or iPad, enter new English words,
and save AI-filled vocabulary rows directly into Google Sheets.

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
EXPORT_CSV_SECRET=your-private-password
```

App routes:

```text
/study  Flashcard study
/add    Quick word add
/       Flashcard study
```

## Local Mac Flashcard App

The local flashcard app can read and update Google Sheets through the Vercel cloud API.
`voca.csv` no longer needs to be used as the local data source.

Create a local file named `.voca_cloud_url` in this project folder:

```text
https://voca-flash-card.vercel.app/api/export-csv
```

If you set `EXPORT_CSV_SECRET`, include it as a query string:

```text
https://voca-flash-card.vercel.app/api/export-csv?secret=your-private-password
```

The local Python server converts this URL to `/api/cloud-words` internally.
Then run `VOCA 실행.command`. The app will read the latest Google Sheets rows through Vercel and send review updates back to Google Sheets.

## Data Flow

```text
iPhone Vercel app
-> English word input
-> OpenAI fills meaning/example fields
-> Google Sheets row append
-> Local Mac app reads /api/cloud-words
-> Review progress updates Google Sheets
```
