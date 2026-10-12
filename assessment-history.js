(function exposeAssessmentHistory(root) {
  function compareAssessmentScores(previousScore, currentScore) {
    if (!Number.isInteger(previousScore) || !Number.isInteger(currentScore)) return null;
    return {
      previous_score: previousScore,
      current_score: currentScore,
      score_changed: previousScore !== currentScore,
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { compareAssessmentScores };
  else root.compareAssessmentScores = compareAssessmentScores;
}(globalThis));
