# HR data export

**All data in this folder is synthetic.** Every candidate, answer, name, email address and number was made up for this exercise. None of it describes a real person.

This is what our HR Manager exported for you. The export was taken on 20 September 2026, so nothing in it is dated later.

## Files

| File | What it contains |
|---|---|
| `questions.md` | The six interview questions every candidate answers, each with the 1-to-4 guide HR scores against |
| `answers/` | Recent candidate answers, submitted 14 to 20 September. Each `.json` file holds one answer. Most carry a transcript. Five are audio only, with the recording in the matching `.m4a` file |
| `scoring_sheet.csv` | Scores from August and September. Each answer was scored by two people in HR. The pass mark is in `questions.md` |
| `hr_reference_scores.csv` | HR's own scores for ten of the answers in `answers/`, using the grading guides in `questions.md` |
| `pipeline_log.csv` | Eight weeks of applications: who applied, when they were invited, when they submitted answers, and where they stand |
| `hr_time_log.csv` | How HR's working hours were spent each week, by task, over the same eight weeks |
| `inbox_export.csv` | Two weeks of the HR inbox, with the sender, subject and the start of each message |

The same `candidate_id` means the same person across `answers/`, `scoring_sheet.csv` and `pipeline_log.csv`. Candidates' email addresses in `inbox_export.csv` match `pipeline_log.csv`.

## Data dictionary for `pipeline_log.csv`

**`cv_tier`**, the result of the CV screen:

- **Tier 1:** the strongest CVs.
- **Tier 2:** middle.
- **Tier 3:** the weakest CVs. Most are not invited to answer questions.

**`outcome`**, where the candidate stood on 20 September:

- **`not_invited`:** not invited to answer interview questions after the CV screen. `outcome_on` is the date of that decision.
- **`no_answers_received`:** invited, but never submitted answers. `outcome_on` is the date HR closed the application.
- **`awaiting_decision`:** still in progress on the export date. Either invited and not yet submitted, or answers submitted and not yet decided. `outcome_on` is empty.
- **`advanced`:** moved on to the next hiring stage. `outcome_on` is the date of that decision.
- **`rejected`:** not taken forward after their answers were reviewed. `outcome_on` is the date of that decision.
- **`withdrew`:** the candidate withdrew from the process before HR made a decision. `outcome_on` is the date they told HR.

You may add your own data alongside these files.

## Local interview review dashboard

This workspace also includes a small, static review interface in `index.html`, `styles.css`, and `app.js`. It reads the answer JSONs in `answers/`, the question text and scoring guides in this file's companion `questions.md`, and the reference rows in `hr_reference_scores.csv`.

### Run the demo

1. Install nothing. Make sure Node.js is available.
2. Open a terminal in this folder (`business-systems-pack`).
3. Start the built-in Node.js static server:

   ```text
   node server.js
   ```

4. Open [http://localhost:8000](http://localhost:8000) in a browser. If port 8000 is busy, set a different port before starting, for example `$env:PORT=8001; node server.js` in PowerShell, then use `http://localhost:8001`.
5. Stop the server with `Ctrl+C` in the terminal.

Use the response list or search/filter controls to select an answer. Choose a score from 1 to 4, add a short rationale, and submit. The matching HR reference score is revealed only after submission. Reviews are saved in that browser's `localStorage`; they are not written to the workspace and are not shared across browsers.

### Test the demo locally

With the server running, use this manual walkthrough in the browser:

1. Select `A001` (`Q1`): confirm its transcript, Q1 prompt, and four scoring descriptions appear.
2. Select `A031` (`Q5`): confirm the manual-review flag and audio player appear. Play the audio if the browser supports it.
3. Select `A007` (`Q2`): confirm the missing-response flag appears and score controls are disabled.
4. Return to `A002` (`Q2`). Submit with no score and confirm the validation message. Then choose a score but leave the rationale blank and submit; confirm a rationale is required.
5. Enter a score and rationale, then submit. Confirm your score and rationale appear, and only then the HR reference score (`2 / 4`) appears.
6. Refresh the page and select `A002` again. Confirm the submitted review remains in that browser. The queue label should show it as reviewed.
7. Confirm no candidate-level pass/fail outcome is shown.

For a clean repeat, clear this site's local storage in browser developer tools (Application/Storage → Local Storage → `http://localhost:8000`) and refresh. This affects only the demo's saved reviews in that browser.

### Architecture and limitations

- The app is plain HTML, CSS, and JavaScript with no build step or package dependencies. `server.js` uses only Node.js built-in modules, serves the existing allowlisted dashboard assets and answer folder listing, and binds to the local machine. Its optional scoring endpoint calls OpenRouter only after an explicit reviewer action.
- The browser fetches answer JSON files by discovering the JSON links in the local server's `answers/` directory listing. The rubric parser reads `questions.md` and extracts each `Qn` heading and its four numbered score descriptions. Reference rows are loaded from `hr_reference_scores.csv`.
- **Answer-to-grade flow:** the reviewer selects one answer from the local answer list and, if it has a transcript, explicitly clicks **AI Score**. The browser sends only its answer ID to `POST /api/score`; the server reads that answer JSON and `questions.md`, sends the matching question, rubric, pass mark, and transcript to the configured OpenRouter model, validates the structured result and transcript evidence, then returns the advisory assessment. The reviewer separately enters and submits a human score and rationale. The reference is revealed after that submission. Audio is not sent, and missing/audio-only answers need manual review.
- Rule-based behavior includes detecting transcript/audio/missing availability; validating the human score and rationale; revealing a matching reference only after the human submits; validating the AI response fields and exact transcript evidence; and applying the assignment's score-1 rule if an answer is flagged off-question. These checks do not independently evaluate answer quality.
- When configured, an LLM provides an advisory per-answer assessment using the matching rubric. The reviewer still supplies the final score. There is no candidate ranking, or candidate pass/fail decision. The 35 answer records are not complete six-answer sets, and the demo does not calculate candidate advancement.
- Audio-only answers can be played in the browser and are flagged for manual review. `A007` has neither a transcript nor an audio file; scoring is disabled for that missing response. This demo does not transcribe audio.
- Reference scores exist for only ten answers. They are shown as calibration context after the reviewer submits, not as a target or a replacement for human judgment.
- **Reference-score agreement has not been measured.** The dashboard reveals individual HR reference scores after human submission, but does not calculate agreement rates, correlation, or other evaluation metrics. Ten reference rows are not sufficient evidence of model quality.
- The data is synthetic. Browser storage is local to the browser profile and is intended for a demo, not a production HR record system.

## Optional OpenRouter AI assessment

The local server has an optional `POST /api/score` endpoint. It calls OpenRouter's chat completions API only after a reviewer clicks **AI Score** for one answer with a transcript. The browser sends only that answer's ID; the server reads the transcript, matching question, rubric, and pass mark. Audio is never uploaded. The API key stays in the server process environment and is not sent to browser code. OpenRouter documents the chat completions endpoint and JSON Schema structured output; structured output support depends on the selected model/provider. Choose a currently available model that supports JSON Schema output in OpenRouter. There is intentionally no assumed model ID or default. Set `OPENROUTER_MODEL` explicitly. See [OpenRouter chat completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) and [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

### Configure and run in Windows PowerShell

In PowerShell, change to this folder. Enter the key at a secure prompt (it is not part of a command-history line), then choose a model ID currently available to your OpenRouter account:

```powershell
$secureKey = Read-Host 'OpenRouter API key' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $env:OPENROUTER_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}
$env:OPENROUTER_MODEL = Read-Host 'OpenRouter model ID (must support structured outputs)'
try {
    node server.js
}
finally {
    Remove-Item Env:OPENROUTER_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:OPENROUTER_MODEL -ErrorAction SilentlyContinue
    $secureKey.Dispose()
}
```

Keep the server terminal open while using the dashboard at `http://localhost:8000`. The key exists in the server process environment while it runs; do not put it in source files, README, browser code, test fixtures, or a committed `.env` file. Stop the server with Ctrl+C; the `finally` block removes the variables from that PowerShell session. OpenRouter may charge or rate-limit requests according to your account and selected model. Clicking the button sends that answer transcript to OpenRouter.

If PowerShell is interrupted before the cleanup block runs, clear the variables in that same terminal with `Remove-Item Env:OPENROUTER_API_KEY, Env:OPENROUTER_MODEL -ErrorAction SilentlyContinue`.

### Offline automated tests and manual live check

Run syntax checks and the offline test suite from another PowerShell terminal in this folder:

```powershell
node --check server.js
node --check app.js
node --check assessment-history.js
node --check tests/ai-scoring.test.js
node --test
```

The automated tests use mocked OpenRouter responses and make no network/API calls. To make one real check, configure the environment as above, start the server, open the dashboard, select a transcript answer such as `A001`, and click **AI Score** once. Confirm the model, score, reasoning, transcript evidence, flags, and human-review recommendation appear; then submit a separate human score and rationale in the existing form. To retry, click **Retry AI score** after an error. Select an audio-only answer such as `A031` to confirm AI scoring is disabled and manual review is requested. A live check is optional and is not part of the offline tests.

### AI assessment limitations

- Model output is an advisory assessment, not a human review, candidate ranking, or advancement decision. HR must enter and submit the final human score and rationale. Reference-score reveal behavior remains tied to the submitted human review, including hiding the reference during edits.
- Repeated AI scores for the same answer are compared during the current page session. Agreement or a changed score is shown beside the assessment; a changed score requires human review. This small prototype comparison is held in browser memory and clears when the page is refreshed.
- The server validates the response schema and checks that each quoted evidence string occurs in the transcript. These checks cannot establish that the model's reasoning is correct. Prompt-injection instructions are treated as untrusted transcript content and flagged when detected, but prompt defenses and model flags are not guarantees.
- The model is asked not to penalize another language; when it cannot reliably assess meaning it should flag uncertainty and request human review. Language detection and that self-assessment can be wrong.
- API, timeout, rate-limit, unsupported structured-output, and validation errors produce an explicit not-graded state. No fallback or fabricated score is used. Retry only after checking model/account configuration.
- Each request sends one selected transcript and its question/rubric to OpenRouter. The prototype has no production privacy controls, audit log, retention policy, authentication, or model evaluation. Use synthetic data only.
