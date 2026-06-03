# Vercel AI Quick Add Setup

This app lets you open a public Vercel URL from iPhone, enter only an English word,
and save an AI-filled row into `voca.csv` in GitHub.

## Required Vercel Environment Variables

Set these in Vercel Project Settings -> Environment Variables.

```text
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=github_pat_...
GITHUB_REPO=owner/repository
GITHUB_BRANCH=main
GITHUB_CSV_PATH=voca.csv
```

Optional:

```text
OPENAI_MODEL=gpt-5.4-mini
ADD_WORD_SECRET=your-private-password
```

If `ADD_WORD_SECRET` is set, enter the same password in the mobile web app before saving.

## GitHub Token Permission

Create a fine-grained GitHub token with access to this repository and permission:

```text
Contents: Read and write
```

The Vercel API reads `voca.csv`, appends one AI-generated row, then commits the updated CSV.

## Deploy Flow

1. Push this project to GitHub.
2. Import the GitHub repository in Vercel.
3. Add the environment variables above.
4. Deploy.
5. Open the Vercel URL on iPhone.

## Notes

- Vercel serverless functions do not persist local file writes, so GitHub is the source of truth for `voca.csv`.
- The existing local Python app can still read and study with the checked-out `voca.csv`.
- After adding words through Vercel, pull/sync the GitHub changes on the Mac before local study if the local CSV has not updated yet.
