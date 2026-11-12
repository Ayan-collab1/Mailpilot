import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  FileSpreadsheet,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CandidateContact,
  ImportAnalysisResult,
} from '../types/mailpilot';
import {
  buildAnalysisForSheet,
  downloadSampleExcelFile,
  generateSampleWorkbookAnalysis,
  isValidEmailAddress,
  parseUploadedSpreadsheet,
} from '../utils/excelParser';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingContactsCount: number;
  onConfirmImport: (
    candidates: CandidateContact[],
    fileName: string,
    sheetName: string,
    mode: 'append' | 'replace'
  ) => void;
  initialAnalysis?: ImportAnalysisResult | null;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  existingContactsCount,
  onConfirmImport,
  initialAnalysis = null,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysisResult | null>(
    initialAnalysis
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFilter, setPreviewFilter] = useState<
    'all' | 'valid' | 'invalid' | 'duplicates'
  >('all');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  // Brand batch selector: 'all' or 0-indexed batch of 50 brands (0 = Brands 1-50, 1 = Brands 51-100, etc.)
  const [selectedBrandBatch, setSelectedBrandBatch] = useState<'all' | number>(
    'all'
  );

  React.useEffect(() => {
    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
      setSelectedBrandBatch('all');
      setErrorMsg(null);
    }
  }, [initialAnalysis]);

  const activeSheet = useMemo(() => {
    if (!analysis) return null;
    return (
      analysis.sheets.find((s) => s.sheetName === analysis.activeSheetName) ||
      analysis.sheets[0] ||
      null
    );
  }, [analysis]);

  // Distinct ordered brandTempIds in the analysis
  const orderedBrandTempIds = useMemo(() => {
    if (!analysis) return [];
    const seen = new Set<string>();
    const order: string[] = [];
    for (const c of analysis.candidates) {
      if (!seen.has(c.brandTempId)) {
        seen.add(c.brandTempId);
        order.push(c.brandTempId);
      }
    }
    return order;
  }, [analysis]);

  // Candidate subset matching the selected 50-brand batch window (never splits a brand across batches)
  const batchScopedCandidates = useMemo(() => {
    if (!analysis) return [];
    if (selectedBrandBatch === 'all') return analysis.candidates;
    const startBrandIdx = selectedBrandBatch * 50;
    const allowedBrands = new Set(
      orderedBrandTempIds.slice(startBrandIdx, startBrandIdx + 50)
    );
    return analysis.candidates.filter((c) => allowedBrands.has(c.brandTempId));
  }, [analysis, orderedBrandTempIds, selectedBrandBatch]);

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return batchScopedCandidates.filter((c) => {
      if (q) {
        const matchBrand = c.brandName.toLowerCase().includes(q);
        const matchEmail = c.email.toLowerCase().includes(q);
        const matchSource = (c.sourceList || '').toLowerCase().includes(q);
        if (!matchBrand && !matchEmail && !matchSource) return false;
      }
      if (previewFilter === 'valid') {
        return (
          !c.validationFlags.invalidEmail &&
          !c.validationFlags.missingBrand &&
          !c.validationFlags.duplicateEmail
        );
      }
      if (previewFilter === 'invalid') {
        return c.validationFlags.invalidEmail || c.validationFlags.missingBrand;
      }
      if (previewFilter === 'duplicates') {
        return (
          c.validationFlags.duplicateEmail || c.validationFlags.duplicateBrand
        );
      }
      return true;
    });
  }, [batchScopedCandidates, searchQuery, previewFilter]);

  const scopedBrandCount = useMemo(() => {
    return new Set(batchScopedCandidates.map((c) => c.brandTempId)).size;
  }, [batchScopedCandidates]);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    setErrorMsg(null);
    setIsParsing(true);
    try {
      const result = await parseUploadedSpreadsheet(file);
      setAnalysis(result);
      setSelectedBrandBatch('all');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to parse file. Please upload a valid .xlsx, .xls, or .csv file.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleLoadSample50 = () => {
    setErrorMsg(null);
    if (analysis && orderedBrandTempIds.length > 50) {
      // If user already uploaded a large file (>50 brands), "Load 50 Brands" selects the first 50 brands from it
      setSelectedBrandBatch(0);
      return;
    }
    const sample = generateSampleWorkbookAnalysis();
    setAnalysis(sample);
    setSelectedBrandBatch('all');
  };

  const handleSheetChange = (newSheetName: string) => {
    if (!analysis) return;
    const targetSheet = analysis.sheets.find(
      (s) => s.sheetName === newSheetName
    );
    if (!targetSheet) return;
    const brandCol =
      targetSheet.detectedBrandCol || targetSheet.headers[0] || '';
    const emailCol =
      targetSheet.detectedEmailCol ||
      targetSheet.headers[1] ||
      targetSheet.headers[0] ||
      '';
    setAnalysis(
      buildAnalysisForSheet(
        analysis.fileName,
        analysis.sheets,
        newSheetName,
        brandCol,
        emailCol,
        targetSheet.confidence
      )
    );
    setSelectedBrandBatch('all');
  };

  const handleColumnChange = (type: 'brand' | 'email', newCol: string) => {
    if (!analysis) return;
    const brandCol = type === 'brand' ? newCol : analysis.brandColumn;
    const emailCol = type === 'email' ? newCol : analysis.emailColumn;
    setAnalysis(
      buildAnalysisForSheet(
        analysis.fileName,
        analysis.sheets,
        analysis.activeSheetName,
        brandCol,
        emailCol,
        'high'
      )
    );
    setSelectedBrandBatch('all');
  };

  const handleToggleCandidateExclude = (tempId: string) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      candidates: analysis.candidates.map((c) =>
        c.tempId === tempId ? { ...c, excluded: !c.excluded } : c
      ),
    });
  };

  const handleRemoveCandidate = (tempId: string) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      candidates: analysis.candidates.filter((c) => c.tempId !== tempId),
    });
  };

  const handleInlineEditCandidate = (
    tempId: string,
    field: 'brandName' | 'email',
    value: string
  ) => {
    if (!analysis) return;
    const updated = analysis.candidates.map((c) => {
      if (c.tempId !== tempId) return c;
      const nextBrand = field === 'brandName' ? value : c.brandName;
      const nextEmail = field === 'email' ? value : c.email;
      const invalidEmail = !isValidEmailAddress(nextEmail);
      const missingBrand = nextBrand.trim().length === 0;
      return {
        ...c,
        brandName: nextBrand,
        email: nextEmail,
        status: invalidEmail ? ('Invalid' as const) : ('Pending' as const),
        excluded: invalidEmail ? true : false,
        validationFlags: {
          ...c.validationFlags,
          invalidEmail,
          missingBrand,
        },
      };
    });
    setAnalysis({
      ...analysis,
      candidates: updated,
    });
  };

  const handleConfirm = () => {
    if (!analysis || batchScopedCandidates.length === 0) return;
    onConfirmImport(
      batchScopedCandidates,
      analysis.fileName,
      analysis.activeSheetName,
      importMode
    );
    setAnalysis(null);
    onClose();
  };

  const includedCount = batchScopedCandidates.filter((c) => !c.excluded).length;
  const totalBatchChunks = Math.ceil(orderedBrandTempIds.length / 50);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Import Contacts
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* File Dropzone / Picker Bar */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const droppedFile = e.dataTransfer.files?.[0];
              if (droppedFile) handleFileSelect(droppedFile);
            }}
            className="flex flex-col items-center justify-between gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 sm:flex-row dark:border-slate-700 dark:bg-slate-800/40"
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {analysis ? analysis.fileName : 'Upload Excel or CSV'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{analysis ? 'Change File' : 'Upload Excel / CSV'}</span>
              </button>
              <button
                type="button"
                onClick={handleLoadSample50}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span>Load 50 Brands</span>
              </button>
              <button
                type="button"
                onClick={downloadSampleExcelFile}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Download sample .xlsx"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Sample .xlsx</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="font-medium">{errorMsg}</p>
            </div>
          )}

          {analysis && activeSheet && (
            <>
              {/* Column Mapping, Sheet Selection & 50-Brand Batch Window */}
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
                {analysis.sheets.length > 1 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Worksheet
                    </label>
                    <select
                      value={analysis.activeSheetName}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {analysis.sheets.map((s) => (
                        <option key={s.sheetName} value={s.sheetName}>
                          {s.sheetName} ({s.rows.length})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Brand Column
                  </label>
                  <select
                    value={analysis.brandColumn}
                    onChange={(e) => handleColumnChange('brand', e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {activeSheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Email Column
                  </label>
                  <select
                    value={analysis.emailColumn}
                    onChange={(e) => handleColumnChange('email', e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {activeSheet.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                {orderedBrandTempIds.length > 50 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Brand Batch (50 Brands)
                    </label>
                    <select
                      value={selectedBrandBatch}
                      onChange={(e) =>
                        setSelectedBrandBatch(
                          e.target.value === 'all'
                            ? 'all'
                            : Number(e.target.value)
                        )
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="all">
                        All Brands ({orderedBrandTempIds.length} brands)
                      </option>
                      {Array.from({ length: totalBatchChunks }).map((_, idx) => {
                        const start = idx * 50 + 1;
                        const end = Math.min(
                          (idx + 1) * 50,
                          orderedBrandTempIds.length
                        );
                        return (
                          <option key={idx} value={idx}>
                            Brands {start}–{end} ({end - start + 1} brands)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {analysis.confidence === 'uncertain' && (
                  <div className="flex items-center text-xs font-medium text-amber-600 dark:text-amber-400">
                    Please verify mapped columns.
                  </div>
                )}
              </div>

              {/* Validation & Analysis Summary */}
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-6 dark:border-slate-800 dark:bg-slate-800/30">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Brands
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {scopedBrandCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Emails Found
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                    {batchScopedCandidates.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Valid Emails
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {
                      batchScopedCandidates.filter(
                        (c) =>
                          !c.validationFlags.invalidEmail &&
                          !c.validationFlags.missingBrand
                      ).length
                    }
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Invalid Email
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {
                      batchScopedCandidates.filter(
                        (c) => c.validationFlags.invalidEmail
                      ).length
                    }
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Duplicates Removed
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                    {analysis.summary.duplicateEmailCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Empty Ignored
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                    {analysis.summary.emptyRowsIgnored}
                  </p>
                </div>
              </div>

              {/* Preview Table Controls */}
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  {(
                    [
                      {
                        id: 'all',
                        label: `All (${batchScopedCandidates.length})`,
                      },
                      {
                        id: 'valid',
                        label: `Valid (${
                          batchScopedCandidates.filter(
                            (c) =>
                              !c.validationFlags.invalidEmail &&
                              !c.validationFlags.missingBrand
                          ).length
                        })`,
                      },
                      {
                        id: 'invalid',
                        label: `Issues (${
                          batchScopedCandidates.filter(
                            (c) =>
                              c.validationFlags.invalidEmail ||
                              c.validationFlags.missingBrand
                          ).length
                        })`,
                      },
                      {
                        id: 'duplicates',
                        label: `Multi-Row Brands (${
                          batchScopedCandidates.filter(
                            (c) => c.validationFlags.duplicateBrand
                          ).length
                        })`,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPreviewFilter(tab.id)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        previewFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search brand or email..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Contact Preview Table */}
              <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-800/90 dark:text-slate-300">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-3 py-2.5 font-medium">Queue</th>
                      <th className="px-3 py-2.5 font-medium">Row</th>
                      <th className="px-3 py-2.5 font-medium">Brand Name</th>
                      <th className="px-3 py-2.5 font-medium">Recipient</th>
                      <th className="px-3 py-2.5 font-medium">Email Address</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredCandidates.map((cand) => {
                      const notes: string[] = [];
                      if (cand.validationFlags.missingBrand)
                        notes.push('Missing brand');
                      if (cand.validationFlags.invalidEmail)
                        notes.push('Invalid email');

                      return (
                        <tr
                          key={cand.tempId}
                          className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                            cand.excluded ? 'opacity-60' : ''
                          }`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={!cand.excluded}
                              onChange={() =>
                                handleToggleCandidateExclude(cand.tempId)
                              }
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-400 tabular-nums">
                            {cand.rowNumber}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={cand.brandName}
                              placeholder="Brand name"
                              onChange={(e) =>
                                handleInlineEditCandidate(
                                  cand.tempId,
                                  'brandName',
                                  e.target.value
                                )
                              }
                              className={`w-full rounded border px-2 py-1 text-xs font-medium focus:border-blue-600 focus:outline-none ${
                                cand.validationFlags.missingBrand
                                  ? 'border-amber-400 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/30'
                                  : 'border-transparent bg-transparent hover:border-slate-200 dark:hover:border-slate-700'
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500 tabular-nums dark:text-slate-400">
                            {cand.recipientIndex}/{cand.totalBrandRecipients}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={cand.email}
                              placeholder="Email address"
                              onChange={(e) =>
                                handleInlineEditCandidate(
                                  cand.tempId,
                                  'email',
                                  e.target.value
                                )
                              }
                              className={`w-full rounded border px-2 py-1 font-mono text-xs focus:border-blue-600 focus:outline-none ${
                                cand.validationFlags.invalidEmail
                                  ? 'border-red-400 bg-red-50/40 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300'
                                  : 'border-transparent bg-transparent hover:border-slate-200 dark:hover:border-slate-700'
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5 text-xs">
                              <span
                                className={
                                  cand.status === 'Invalid'
                                    ? 'font-medium text-red-600 dark:text-red-400'
                                    : 'font-medium text-slate-700 dark:text-slate-300'
                                }
                              >
                                {cand.status}
                              </span>
                              {notes.length > 0 && (
                                <>
                                  <span
                                    aria-hidden="true"
                                    className="text-slate-400"
                                  >
                                    ·
                                  </span>
                                  <span className="text-amber-600 dark:text-amber-400">
                                    {notes.join(' · ')}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveCandidate(cand.tempId)}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                              title="Remove"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col items-stretch justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
          {existingContactsCount > 0 && analysis ? (
            <div className="flex items-center gap-3 text-xs">
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                  className="text-blue-600"
                />
                <span>Append</span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="text-blue-600"
                />
                <span>Replace list</span>
              </label>
            </div>
          ) : (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {analysis
                ? `${scopedBrandCount} brands · ${includedCount} valid emails queued`
                : ''}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!analysis || batchScopedCandidates.length === 0}
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Check className="h-3.5 w-3.5" />
              <span>
                Confirm Import{' '}
                {analysis
                  ? `(${scopedBrandCount} Brands · ${batchScopedCandidates.length} Emails)`
                  : ''}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
