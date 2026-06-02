<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8499be92-05ff-4f31-b0b4-580ce8cfab59

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy To GitHub Pages

This repo includes automatic deployment via GitHub Actions: `.github/workflows/deploy.yml`.

1. Push your code to the `main` branch.
2. In GitHub repo settings, open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Wait for the `Deploy To GitHub Pages` workflow to complete.

The workflow builds with the correct Vite `base` for project pages and publishes `dist` to GitHub Pages automatically.
