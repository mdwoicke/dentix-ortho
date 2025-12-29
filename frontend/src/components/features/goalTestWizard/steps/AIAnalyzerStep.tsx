/**
 * AI Analyzer Step (Step 0)
 * Optional step that analyzes natural language goal descriptions
 * and pre-populates the wizard with AI-generated suggestions
 */

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import {
  selectAIAnalyzer,
  setAnalyzerDescription,
  applyAnalysisResult,
  clearAnalyzer,
  analyzeGoalDescription,
  setStep,
} from '../../../../store/slices/createGoalTestSlice';
import { WizardStep } from '../../../../types/goalTestWizard.types';

// Example goal descriptions for hints
const EXAMPLE_GOALS = [
  'Test that a new parent can call in, provide their information, and schedule an orthodontic consult for their child.',
  'Test booking for two siblings with the same parent, verifying both children are scheduled.',
  'Test what happens when a parent with an existing patient calls to schedule a follow-up appointment.',
  'Test error handling when no appointment slots are available for the requested date.',
  'Test a parent with Medicaid insurance scheduling a new patient consult.',
];

export function AIAnalyzerStep() {
  const dispatch = useAppDispatch();
  const aiAnalyzer = useAppSelector(selectAIAnalyzer);
  const [showExamples, setShowExamples] = useState(false);

  const handleAnalyze = async () => {
    if (aiAnalyzer.description.trim().length < 10) return;
    dispatch(analyzeGoalDescription({ description: aiAnalyzer.description, model: 'standard' }));
  };

  // Accept the AI analysis result and continue to the next step
  const _handleAcceptAndContinue = () => {
    if (aiAnalyzer.result?.success && aiAnalyzer.result?.wizardData) {
      dispatch(applyAnalysisResult(aiAnalyzer.result));
      dispatch(setStep(WizardStep.BasicInfo));
    }
  };

  const handleSkip = () => {
    dispatch(clearAnalyzer());
    dispatch(setStep(WizardStep.BasicInfo));
  };

  const handleTryAgain = () => {
    dispatch(clearAnalyzer());
  };

  const handleUseExample = (example: string) => {
    dispatch(setAnalyzerDescription(example));
    setShowExamples(false);
  };

  // Render the results panel when analysis is complete
  const renderResults = () => {
    if (!aiAnalyzer.result?.success) return null;

    const { analysis, wizardData, reasoning } = aiAnalyzer.result;

    return (
      <div className="mt-6 space-y-4">
        {/* Success header */}
        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-green-800 dark:text-green-200">
              Analysis Complete
            </h3>
            <p className="text-sm text-green-700 dark:text-green-300">
              Confidence: {Math.round(analysis.confidence * 100)}%
            </p>
          </div>
        </div>

        {/* Detected Intent */}
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Detected Intent
          </h4>
          <p className="text-gray-900 dark:text-white font-medium">
            {analysis.detectedIntent}
          </p>
        </div>

        {/* Cloud9 Operations */}
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Cloud9 API Operations
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.cloud9Operations.map((op, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-sm font-mono"
              >
                {op}
              </span>
            ))}
          </div>
        </div>

        {/* Required Data Fields */}
        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
            Required Data Fields
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.requiredDataFields.map((field, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm"
              >
                {field.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            Preview: Will populate...
          </h4>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-gray-400">•</span>
              <span><strong>Name:</strong> &quot;{wizardData.basicInfo.name}&quot;</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">•</span>
              <span><strong>Category:</strong> {wizardData.basicInfo.category}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">•</span>
              <span><strong>Persona:</strong> {wizardData.persona.name}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">•</span>
              <span><strong>Goals:</strong> {wizardData.goals.length} goal(s) defined</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">•</span>
              <span><strong>Constraints:</strong> {wizardData.constraints.length} constraint(s) defined</span>
            </li>
          </ul>
        </div>

        {/* AI Reasoning */}
        {reasoning && (
          <details className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <summary className="cursor-pointer text-sm font-medium text-gray-500 dark:text-gray-400">
              AI Reasoning
            </summary>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
              {reasoning}
            </p>
          </details>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-4 pt-4">
          <button
            id="accept-and-continue-btn"
            type="button"
            onClick={() => {
              if (aiAnalyzer.result?.success && aiAnalyzer.result?.wizardData) {
                dispatch(applyAnalysisResult(aiAnalyzer.result));
                dispatch(setStep(WizardStep.BasicInfo));
              }
            }}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3
                       bg-primary-600 hover:bg-primary-700 text-white
                       rounded-lg font-medium transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Accept &amp; Continue
          </button>
          <button
            type="button"
            onClick={handleTryAgain}
            className="flex items-center justify-center gap-2 px-6 py-3
                       bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200
                       hover:bg-gray-200 dark:hover:bg-gray-600
                       rounded-lg font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Try Again
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 mb-4">
          <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          AI-Powered Test Generation
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Describe your test goal in natural language and let AI analyze it to pre-populate all wizard fields.
          This step is optional - you can skip to manual entry at any time.
        </p>
      </div>

      {/* Main content - input or results */}
      {!aiAnalyzer.result ? (
        <>
          {/* Text Input */}
          <div>
            <label
              htmlFor="goalDescription"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Describe your test goal in natural language:
            </label>
            <textarea
              id="goalDescription"
              value={aiAnalyzer.description}
              onChange={(e) => dispatch(setAnalyzerDescription(e.target.value))}
              placeholder="e.g., Test that a new parent can call in, provide their information and their child's details, and successfully schedule an orthodontic consult appointment..."
              rows={5}
              disabled={aiAnalyzer.loading}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {aiAnalyzer.description.length} / 10 minimum characters
              </p>
              <button
                type="button"
                onClick={() => setShowExamples(!showExamples)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                {showExamples ? 'Hide examples' : 'Show examples'}
              </button>
            </div>
          </div>

          {/* Examples */}
          {showExamples && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Example Goal Descriptions
              </h4>
              <div className="space-y-2">
                {EXAMPLE_GOALS.map((example, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => handleUseExample(example)}
                    className="w-full text-left p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600
                               hover:border-primary-500 dark:hover:border-primary-500 transition-colors
                               text-sm text-gray-700 dark:text-gray-300"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Display */}
          {aiAnalyzer.error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                    Analysis Failed
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {aiAnalyzer.error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={aiAnalyzer.loading || aiAnalyzer.description.trim().length < 10}
              className={`flex items-center justify-center gap-2 px-6 py-3
                         rounded-lg font-medium transition-all
                         ${aiAnalyzer.loading || aiAnalyzer.description.trim().length < 10
                           ? 'border border-gray-400 dark:border-gray-500 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                           : 'bg-gray-600 hover:bg-gray-700 text-white cursor-pointer shadow-sm hover:shadow-md'
                         }`}
            >
              {aiAnalyzer.loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  Analyze with AI
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={aiAnalyzer.loading}
              className="flex items-center justify-center gap-2 px-6 py-3
                         bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200
                         hover:bg-gray-200 dark:hover:bg-gray-600
                         rounded-lg font-medium transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip - Create Manually
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          {/* Loading indicator */}
          {aiAnalyzer.loading && (
            <div className="mt-6 p-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <svg className="animate-spin w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Analyzing your goal description...
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    The AI is identifying Cloud9 operations, required data fields, and generating test configuration.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        renderResults()
      )}
    </div>
  );
}
