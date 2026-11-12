import React, { useMemo, useState } from 'react';
import {
  Check,
  Eye,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { Contact, EmailTemplate } from '../types/mailpilot';
import { personalizeTemplate } from '../utils/emailLauncher';

interface TemplatesViewProps {
  templates: EmailTemplate[];
  contacts: Contact[];
  onSaveTemplate: (template: EmailTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  onSetDefaultTemplate: (templateId: string) => void;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  templates,
  contacts,
  onSaveTemplate,
  onDeleteTemplate,
  onSetDefaultTemplate,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    templates.find((t) => t.isDefault)?.id || templates[0]?.id || ''
  );

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) || templates[0] || null,
    [templates, selectedId]
  );

  const [name, setName] = useState(activeTemplate?.name || '');
  const [subject, setSubject] = useState(activeTemplate?.subject || '');
  const [body, setBody] = useState(activeTemplate?.body || '');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [previewBrand, setPreviewBrand] = useState(
    contacts[0]?.brandName || 'Writesonic'
  );
  const [previewEmail, setPreviewEmail] = useState(
    contacts[0]?.email || 'hello@writesonic.com'
  );

  React.useEffect(() => {
    if (!isCreatingNew && activeTemplate) {
      setName(activeTemplate.name);
      setSubject(activeTemplate.subject);
      setBody(activeTemplate.body);
    }
  }, [activeTemplate, isCreatingNew]);

  const handleSelectExisting = (tpl: EmailTemplate) => {
    setIsCreatingNew(false);
    setSelectedId(tpl.id);
    setName(tpl.name);
    setSubject(tpl.subject);
    setBody(tpl.body);
  };

  const handleStartNew = () => {
    setIsCreatingNew(true);
    setName('New Outreach Template');
    setSubject('Partnership Inquiry for {brand_name}');
    setBody(
      `Hi {brand_name} Team,\n\nWe would love to explore a potential collaboration with {brand_name}.\n\nPlease let us know if your team at {email} is open to a brief introduction.\n\nBest Regards,\nTrueReach Team`
    );
  };

  const handleInsertPlaceholder = (
    target: 'subject' | 'body',
    placeholder: '{brand_name}' | '{email}'
  ) => {
    if (target === 'subject') {
      setSubject((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${placeholder}`);
    } else {
      setBody((prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') || !prev ? '' : ' '}${placeholder}`);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim() || 'Untitled Template';
    const trimmedSubject = subject.trim() || 'Outreach regarding {brand_name}';
    const trimmedBody = body.trim();

    if (isCreatingNew || !activeTemplate) {
      const newId = `tpl_${Date.now()}`;
      const newTpl: EmailTemplate = {
        id: newId,
        name: trimmedName,
        subject: trimmedSubject,
        body: trimmedBody,
        isDefault: templates.length === 0,
        updatedAt: new Date().toISOString(),
      };
      onSaveTemplate(newTpl);
      setIsCreatingNew(false);
      setSelectedId(newId);
    } else {
      onSaveTemplate({
        ...activeTemplate,
        name: trimmedName,
        subject: trimmedSubject,
        body: trimmedBody,
        updatedAt: new Date().toISOString(),
      });
    }

    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const livePreview = useMemo(() => {
    return personalizeTemplate(
      { subject, body },
      { brandName: previewBrand, email: previewEmail }
    );
  }, [subject, body, previewBrand, previewEmail]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Email Templates
        </h2>

        <button
          type="button"
          onClick={handleStartNew}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Template</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Saved Templates List */}
        <div className="rounded-xl border border-slate-200 bg-white lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Templates ({templates.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {templates.map((tpl) => {
              const isSelected = !isCreatingNew && tpl.id === activeTemplate?.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => handleSelectExisting(tpl)}
                  className={`cursor-pointer p-4 transition-colors ${
                    isSelected
                      ? 'bg-blue-50/50 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {tpl.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {tpl.subject}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetDefaultTemplate(tpl.id);
                        }}
                        title={tpl.isDefault ? 'Default' : 'Set as default'}
                        className={`rounded p-1 transition-colors ${
                          tpl.isDefault
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                      >
                        <Star
                          className={`h-3.5 w-3.5 ${
                            tpl.isDefault ? 'fill-current' : ''
                          }`}
                        />
                      </button>
                      {templates.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTemplate(tpl.id);
                            if (selectedId === tpl.id) {
                              const remaining = templates.filter(
                                (item) => item.id !== tpl.id
                              );
                              if (remaining[0]) setSelectedId(remaining[0].id);
                            }
                          }}
                          title="Delete"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {tpl.isDefault && (
                    <p className="mt-2 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      Default
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor & Live Preview */}
        <div className="space-y-6 lg:col-span-8">
          <form
            onSubmit={handleSave}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {isCreatingNew ? 'New Template' : 'Edit Template'}
              </h3>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Template Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Brand Collaboration Outreach"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Subject
                </label>
                <div className="flex items-center gap-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      handleInsertPlaceholder('subject', '{brand_name}')
                    }
                    className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                  >
                    + {'{brand_name}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertPlaceholder('subject', '{email}')}
                    className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                  >
                    + {'{email}'}
                  </button>
                </div>
              </div>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Collaboration Opportunity with TrueReach"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Body
                </label>
                <div className="flex items-center gap-2.5 text-xs">
                  <button
                    type="button"
                    onClick={() => handleInsertPlaceholder('body', '{brand_name}')}
                    className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                  >
                    + {'{brand_name}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertPlaceholder('body', '{email}')}
                    className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                  >
                    + {'{email}'}
                  </button>
                </div>
              </div>
              <textarea
                rows={9}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {savedNotice && 'Saved'}
              </div>
              <div className="flex items-center gap-2.5">
                {isCreatingNew && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNew(false);
                      if (activeTemplate) handleSelectExisting(activeTemplate);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Template</span>
                </button>
              </div>
            </div>
          </form>

          {/* Live Preview */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Live Preview
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={previewBrand}
                  onChange={(e) => setPreviewBrand(e.target.value)}
                  placeholder="Brand"
                  className="w-36 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
                <input
                  type="text"
                  value={previewEmail}
                  onChange={(e) => setPreviewEmail(e.target.value)}
                  placeholder="Email"
                  className="w-44 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span className="w-16 font-medium">To</span>
                <span className="font-mono text-slate-900 dark:text-slate-100">
                  {livePreview.to}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span className="w-16 font-medium">Subject</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {livePreview.subject}
                </span>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 whitespace-pre-wrap leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
                {livePreview.body}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
