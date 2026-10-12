const ANSWER_DIR = 'answers/';
const REVIEW_KEY = 'hr-interview-review-dashboard-v1';

const state = { answers: [], rubrics: new Map(), references: new Map(), reviews: {}, pendingEdits: new Set(), aiResults: new Map(), aiScoreHistory: new Map(), aiLoadingId: null, selectedId: null };
const el = (id) => document.getElementById(id);

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value.length || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...records] = rows;
  return records.filter((record) => record.some((cell) => cell !== '')).map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
}

function parseRubrics(markdown) {
  const result = new Map();
  const lines = markdown.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(Q\d+)\.\s+(.+)$/);
    if (heading) {
      current = { id: heading[1], text: heading[2].trim(), scores: [] };
      result.set(current.id, current);
      continue;
    }
    const score = line.match(/^-\s+\*{0,2}([1-4]):\*{0,2}\s+(.+)$/);
    if (score && current) current.scores.push({ score: Number(score[1]), text: score[2].trim() });
  }
  return result;
}

function availability(answer) {
  if (typeof answer.transcript === 'string' && answer.transcript.trim()) return 'transcript';
  if (answer.audio_file) return 'audio';
  return 'missing';
}

function readReviews() {
  try { state.reviews = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}'); }
  catch { state.reviews = {}; }
}

async function loadData() {
  const response = await fetch('questions.md');
  if (!response.ok) throw new Error('Could not load questions.md. Start the local server from the workspace root.');
  const markdown = await response.text();
  state.rubrics = parseRubrics(markdown);
  const scoresResponse = await fetch('hr_reference_scores.csv');
  if (!scoresResponse.ok) throw new Error('Could not load hr_reference_scores.csv.');
  for (const reference of parseCsv(await scoresResponse.text())) state.references.set(reference.answer_id, reference);
  const directoryResponse = await fetch(ANSWER_DIR);
  if (!directoryResponse.ok) throw new Error('Could not list the answers folder.');
  const directory = new DOMParser().parseFromString(await directoryResponse.text(), 'text/html');
  const fileNames = [...directory.querySelectorAll('a[href]')]
    .map((link) => decodeURIComponent(link.getAttribute('href').split('/').pop()))
    .filter((name) => /^A\d+\.json$/.test(name));
  if (!fileNames.length) throw new Error('No answer JSON files were found in answers/.');
  const loaded = await Promise.all(fileNames.map(async (file) => {
    const response = await fetch(ANSWER_DIR + file);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Could not load ${file}.`);
    return response.json();
  }));
  state.answers = loaded.filter(Boolean).sort((a, b) => a.answer_id.localeCompare(b.answer_id, undefined, { numeric: true }));
  readReviews();
}

function renderList() {
  const search = el('search').value.trim().toLowerCase();
  const filter = el('availability-filter').value;
  const filtered = state.answers.filter((answer) => {
    const kind = availability(answer);
    const searchable = `${answer.answer_id} ${answer.candidate_id} ${answer.role} ${answer.question_id}`.toLowerCase();
    return (!search || searchable.includes(search)) && (filter === 'all' || filter === kind);
  });
  const list = el('answer-list');
  list.replaceChildren();
  for (const answer of filtered) {
    const kind = availability(answer);
    const item = document.createElement('button');
    item.type = 'button'; item.className = 'answer-item'; item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(answer.answer_id === state.selectedId));
    item.innerHTML = `<div class="item-top"><span class="item-candidate">${escapeHtml(answer.candidate_id)}</span><span class="status-pill ${kind}">${kindLabel(kind)}</span></div><div class="item-role">${escapeHtml(answer.role || 'Role not provided')}</div><div class="item-bottom"><span class="qid">${escapeHtml(answer.question_id || 'Question unknown')} · ${escapeHtml(answer.answer_id)}</span><span class="qid">${state.reviews[answer.answer_id] ? 'Reviewed ✓' : ''}</span></div>`;
    item.addEventListener('click', () => selectAnswer(answer.answer_id));
    list.append(item);
  }
  el('queue-subtitle').textContent = `${filtered.length} shown · ${state.answers.length} total`;
  el('list-foot').textContent = `${state.answers.filter((a) => availability(a) === 'audio').length} audio-only · ${state.answers.filter((a) => availability(a) === 'missing').length} missing response`;
  el('queue-count').textContent = state.answers.length;
  if (!filtered.length) list.innerHTML = '<div class="empty-list">No responses match your search.</div>';
}

function kindLabel(kind) { return ({ transcript: 'Transcript', audio: 'Audio only · review', missing: 'Missing · review' })[kind]; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

function selectAnswer(answerId) {
  state.selectedId = answerId;
  renderList();
  renderSelected();
}

function renderSelected() {
  const answer = state.answers.find((item) => item.answer_id === state.selectedId);
  const fieldset = el('score-fieldset');
  el('validation-message').textContent = '';
  if (!answer) { fieldset.disabled = true; el('ai-score-button').disabled = true; el('ai-action-note').textContent = 'Select an answer to review.'; el('ai-result').replaceChildren(); return; }
  const kind = availability(answer);
  const rubric = state.rubrics.get(answer.question_id);
  el('answer-title').textContent = `${answer.candidate_id} · ${answer.question_id}`;
  el('answer-meta').textContent = `${answer.role || 'Role not provided'} · Answer ${answer.answer_id} · ${formatDate(answer.submitted_at)}`;
  el('availability-badge').innerHTML = `<span class="status-pill ${kind}">${kindLabel(kind)}</span>`;
  let content = '';
  if (kind === 'audio') content += `<div class="answer-flag warning"><strong>Manual review:</strong> This response has an audio file but no transcript. Listen to the recording before scoring. The browser audio control below plays the supplied file.</div><div class="transcript-label">Audio response</div><audio class="audio-player" controls preload="none" src="${ANSWER_DIR}${encodeURIComponent(answer.audio_file)}">Your browser does not support audio playback.</audio>`;
  else if (kind === 'missing') content += '<div class="answer-flag danger"><strong>Manual review required:</strong> No transcript or audio file is available for this response. Do not score from missing content.</div>';
  else content += `<div class="transcript-label">Candidate transcript</div><p class="transcript">${escapeHtml(answer.transcript)}</p>`;
  if (rubric) {
    content += `<div class="rubric-title">Question</div><p class="question-text">${escapeHtml(rubric.text)}</p><div class="rubric-title">Scoring guide</div><div class="rubric">${rubric.scores.map((entry) => `<div class="rubric-card ${entry.score === 3 ? 'meets' : ''}"><div class="rubric-score">${entry.score}${entry.score === 3 ? ' · pass mark' : ''}</div><div class="rubric-description">${escapeHtml(entry.text)}</div></div>`).join('')}</div>`;
  } else content += `<div class="answer-flag danger">No rubric heading for ${escapeHtml(answer.question_id)} was found in questions.md.</div>`;
  el('answer-content').innerHTML = content;
  fieldset.disabled = kind === 'missing' || !rubric;
  renderAiControls(answer);
  renderAiResult(answer);
  const previous = state.reviews[answer.answer_id];
  el('rationale').value = previous?.rationale || '';
  document.querySelectorAll('input[name="score"]').forEach((input) => { input.checked = String(previous?.score || '') === input.value; });
  renderReviewResult(answer);
}

function renderAiControls(answer) {
  const kind = availability(answer);
  const rubric = state.rubrics.get(answer.question_id);
  const aiButton = el('ai-score-button');
  aiButton.disabled = kind !== 'transcript' || !rubric || state.aiLoadingId !== null;
  aiButton.textContent = state.aiLoadingId === answer.answer_id ? 'Scoring…' : state.aiResults.get(answer.answer_id)?.status === 'not_graded' ? 'Retry AI score' : state.aiResults.has(answer.answer_id) ? 'Re-score with AI' : 'AI Score';
  el('ai-action-note').textContent = kind === 'audio'
    ? 'Audio is not sent to the model. Transcription or human review is required.'
    : kind === 'missing' ? 'No transcript is available; this answer needs human review.'
      : !rubric ? 'The matching rubric is unavailable.' : 'Runs only when requested. The transcript is sent to OpenRouter for assessment.';
}

function renderAiResult(answer) {
  const target = el('ai-result');
  target.replaceChildren();
  const result = state.aiResults.get(answer.answer_id);
  if (!result) return;
  if (result.status === 'loading') {
    target.innerHTML = '<div class="ai-state">Requesting an AI assessment… No human score has been submitted.</div>';
    return;
  }
  if (result.status === 'not_graded') {
    target.innerHTML = `<div class="ai-state ai-error"><strong>Not graded · human review required</strong><p>${escapeHtml(result.error || 'No score was generated. Review manually or retry.')}</p><span>No AI score was substituted.</span></div>`;
    return;
  }
  const flags = [
    `Uncertainty: ${result.uncertainty ? 'flagged' : 'not flagged'}`,
    `Off-question: ${result.off_question ? 'flagged' : 'not flagged'}`,
    `Suspicious instruction: ${result.suspicious_instruction ? 'flagged' : 'not flagged'}`,
    `Human review: ${result.human_review_recommended ? 'recommended — ' + result.human_review_reason : 'not specifically recommended'}`,
  ];
  if (result.wrong_question_rule_applied) flags.push('Assignment rule applied: off-question answer scored 1.');
  target.innerHTML = `<div class="ai-state"><div class="ai-result-head"><strong>AI assessment · ${escapeHtml(result.model)}</strong><span class="ai-score-value">${escapeHtml(result.score)} / 4</span></div><p><b>Reasoning:</b> ${escapeHtml(result.reasoning)}</p><div class="ai-evidence"><b>Transcript evidence</b><ul>${result.evidence.map((quote) => `<li>“${escapeHtml(quote)}”</li>`).join('')}</ul></div><div class="ai-flags"><b>Flags and recommendation</b><ul>${flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join('')}</ul></div><p class="ai-disclaimer">AI assessment is advisory only. HR must submit or revise the human score separately.</p></div>`;
  if (result.repeat_comparison) {
    const comparison = result.repeat_comparison;
    const notice = document.createElement('div');
    notice.className = comparison.score_changed ? 'ai-repeat ai-repeat-changed' : 'ai-repeat';
    const heading = document.createElement('strong');
    heading.textContent = comparison.score_changed ? 'Repeat assessments differ' : 'Repeat assessments agree';
    const scores = document.createElement('span');
    scores.textContent = `Previous: ${comparison.previous_score} / 4 · Latest: ${comparison.current_score} / 4`;
    notice.append(heading, scores);
    if (comparison.score_changed) {
      const review = document.createElement('span');
      review.textContent = 'Human review required. Confirm this assessment manually.';
      notice.append(review);
    }
    target.querySelector('.ai-result-head').after(notice);
  }
}

async function requestAiScore() {
  const answer = state.answers.find((item) => item.answer_id === state.selectedId);
  if (!answer || availability(answer) !== 'transcript' || !state.rubrics.has(answer.question_id) || state.aiLoadingId !== null) return;
  const answerId = answer.answer_id;
  state.aiLoadingId = answerId;
  state.aiResults.set(answerId, { status: 'loading' });
  renderAiControls(answer);
  renderAiResult(answer);
  try {
    const response = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer_id: answerId }),
    });
    let result;
    try { result = await response.json(); }
    catch { result = null; }
    if (!response.ok || !result || result.status !== 'graded') {
      state.aiResults.set(answerId, { status: 'not_graded', error: result?.error || 'Scoring service returned no valid assessment. No score was generated; review manually or retry.' });
    } else {
      const history = state.aiScoreHistory.get(answerId) || [];
      const previousScore = history.length ? history[history.length - 1] : null;
      if (previousScore !== null) {
        result.repeat_comparison = compareAssessmentScores(previousScore, result.score);
        if (result.repeat_comparison.score_changed) {
          result.human_review_recommended = true;
          const changeReason = `Repeated AI assessments differed (${previousScore} / 4 previously, ${result.score} / 4 now); confirm the score manually.`;
          result.human_review_reason = result.human_review_reason ? `${result.human_review_reason} ${changeReason}` : changeReason;
        }
      }
      history.push(result.score);
      state.aiScoreHistory.set(answerId, history);
      state.aiResults.set(answerId, result);
    }
  } catch {
    state.aiResults.set(answerId, { status: 'not_graded', error: 'Could not reach the local scoring service. No score was generated; check the server and retry or review manually.' });
  } finally {
    state.aiLoadingId = null;
    const selected = state.answers.find((item) => item.answer_id === state.selectedId);
    if (selected) {
      renderAiControls(selected);
      renderAiResult(selected);
    }
  }
}

function renderReviewResult(answer) {
  const review = state.reviews[answer.answer_id];
  const target = el('review-result');
  if (!review) { target.replaceChildren(); return; }
  const reference = state.references.get(answer.answer_id);
  const pending = state.pendingEdits.has(answer.answer_id);
  const referenceContent = pending
    ? '<div class="reference-box"><span>Review update pending</span><span class="reference-empty">Submit the updated review to view its reference comparison.</span></div>'
    : `<div class="reference-box"><span>HR reference score${reference?.scored_by ? ` · ${escapeHtml(reference.scored_by)}` : ''}</span>${reference ? `<span class="reference-score">${escapeHtml(reference.score)} / 4</span>` : '<span class="reference-empty">No reference score for this answer</span>'}</div>`;
  target.innerHTML = `<div class="submitted-label">Your submitted review · ${escapeHtml(formatDate(review.submittedAt))}${pending ? ' · Changes not submitted' : ''}</div><div class="submitted-score">${escapeHtml(review.score)}<span>/ 4 · human score</span></div>${review.rationale ? `<p class="review-note">${escapeHtml(review.rationale)}</p>` : ''}${referenceContent}`;
}

function markReviewEdited() {
  const answer = state.answers.find((item) => item.answer_id === state.selectedId);
  if (!answer || !state.reviews[answer.answer_id]) return;
  state.pendingEdits.add(answer.answer_id);
  renderReviewResult(answer);
}

function formatDate(value) {
  if (!value) return 'Submission date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function submitReview(event) {
  event.preventDefault();
  const answer = state.answers.find((item) => item.answer_id === state.selectedId);
  if (!answer) return;
  const chosen = document.querySelector('input[name="score"]:checked')?.value;
  const score = Number(chosen);
  const rationale = el('rationale').value.trim();
  if (!chosen || !Number.isInteger(score) || score < 1 || score > 4) { el('validation-message').textContent = 'Choose a score from 1 to 4.'; return; }
  if (!rationale) { el('validation-message').textContent = 'Add a short rationale before submitting.'; el('rationale').focus(); return; }
  const review = { score, rationale, submittedAt: new Date().toISOString() };
  state.reviews[answer.answer_id] = review;
  state.pendingEdits.delete(answer.answer_id);
  try { localStorage.setItem(REVIEW_KEY, JSON.stringify(state.reviews)); el('validation-message').textContent = ''; }
  catch { el('validation-message').textContent = 'Browser storage is unavailable. Your review is shown for this session only.'; }
  renderReviewResult(answer);
  renderList();
}

el('search').addEventListener('input', renderList);
el('availability-filter').addEventListener('change', renderList);
el('review-form').addEventListener('submit', submitReview);
el('review-form').addEventListener('input', markReviewEdited);
el('review-form').addEventListener('change', markReviewEdited);
el('ai-score-button').addEventListener('click', requestAiScore);

loadData().then(() => {
  el('data-status').textContent = `Loaded ${state.answers.length} answers · ${state.references.size} HR references · rubric from questions.md`;
  renderList();
  const firstAvailable = state.answers.find((answer) => availability(answer) !== 'missing');
  if (firstAvailable) selectAnswer(firstAvailable.answer_id);
}).catch((error) => {
  el('data-status').textContent = 'Could not load local data';
  el('answer-list').innerHTML = `<div class="error-box">${escapeHtml(error.message)}<br><br>Run the local server in the workspace root and open the server address shown in the terminal.</div>`;
  el('queue-subtitle').textContent = 'Data unavailable';
});
