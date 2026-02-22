import { useCallback, useEffect, useMemo, useState } from 'react';
import { RiAddLine, RiDeleteBinLine, RiSearchLine } from 'react-icons/ri';
import { Button } from '@/components/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import { Input } from '@/components/primitives/input';
import { LocaleSelect } from '@/components/primitives/locale-select';
import { Separator } from '@/components/primitives/separator';

/** Built-in locale mappings from LocaleNormalizerService */
const BUILT_IN_MAPPINGS: Record<string, string> = {
  'zh-hans': 'zh_CN',
  'zh-hant': 'zh_TW',
  'zh-cn': 'zh_CN',
  'zh-tw': 'zh_TW',
  'zh': 'zh_CN',
  'en-us': 'en_US',
  'en-gb': 'en_GB',
  'en': 'en_US',
  'ja-jp': 'ja_JP',
  'ja': 'ja_JP',
  'ko-kr': 'ko_KR',
  'ko': 'ko_KR',
  'th-th': 'th_TH',
  'th': 'th_TH',
  'es-es': 'es_ES',
  'es-mx': 'es_MX',
  'es': 'es_ES',
  'fr-fr': 'fr_FR',
  'fr-ca': 'fr_CA',
  'fr': 'fr_FR',
  'de-de': 'de_DE',
  'de': 'de_DE',
  'pt-br': 'pt_BR',
  'pt-pt': 'pt_PT',
  'pt': 'pt_BR',
  'it-it': 'it_IT',
  'it': 'it_IT',
  'ru-ru': 'ru_RU',
  'ru': 'ru_RU',
  'ar-sa': 'ar_SA',
  'ar': 'ar_SA',
  'hi-in': 'hi_IN',
  'hi': 'hi_IN',
  'id-id': 'id_ID',
  'id': 'id_ID',
  'vi-vn': 'vi_VN',
  'vi': 'vi_VN',
  'nl-nl': 'nl_NL',
  'nl': 'nl_NL',
  'pl-pl': 'pl_PL',
  'pl': 'pl_PL',
  'tr-tr': 'tr_TR',
  'tr': 'tr_TR',
  'sv-se': 'sv_SE',
  'sv': 'sv_SE',
  'da-dk': 'da_DK',
  'da': 'da_DK',
  'fi-fi': 'fi_FI',
  'fi': 'fi_FI',
  'nb-no': 'nb_NO',
  'no': 'nb_NO',
  'cs-cz': 'cs_CZ',
  'cs': 'cs_CZ',
  'hu-hu': 'hu_HU',
  'hu': 'hu_HU',
  'el-gr': 'el_GR',
  'el': 'el_GR',
  'he-il': 'he_IL',
  'he': 'he_IL',
  'uk-ua': 'uk_UA',
  'uk': 'uk_UA',
  'ro-ro': 'ro_RO',
  'ro': 'ro_RO',
  'ms-my': 'ms_MY',
  'ms': 'ms_MY',
  'fil-ph': 'fil_PH',
  'fil': 'fil_PH',
  'tl': 'fil_PH',
};

interface LocaleAliasesDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  value: Record<string, string>;
  onChange: (aliases: Record<string, string>) => void;
  isReadOnly?: boolean;
}

interface AliasEntry {
  id: string;
  alias: string;
  target: string;
  isNew?: boolean;
}

export function LocaleAliasesDialog({
  isOpen,
  onOpenChange,
  value,
  onChange,
  isReadOnly = false,
}: LocaleAliasesDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customAliases, setCustomAliases] = useState<AliasEntry[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize custom aliases from value prop
  useEffect(() => {
    if (isOpen) {
      const entries = Object.entries(value || {}).map(([alias, target], index) => ({
        id: `existing-${index}`,
        alias,
        target,
      }));
      setCustomAliases(entries);
      setHasChanges(false);
      setSearchQuery('');
    }
  }, [isOpen, value]);

  // Filter built-in mappings based on search
  const filteredBuiltInMappings = useMemo(() => {
    if (!searchQuery) return Object.entries(BUILT_IN_MAPPINGS);

    const query = searchQuery.toLowerCase();

    return Object.entries(BUILT_IN_MAPPINGS).filter(
      ([alias, target]) => alias.toLowerCase().includes(query) || target.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Filter custom aliases based on search
  const filteredCustomAliases = useMemo(() => {
    if (!searchQuery) return customAliases;

    const query = searchQuery.toLowerCase();

    return customAliases.filter(
      (entry) => entry.alias.toLowerCase().includes(query) || entry.target.toLowerCase().includes(query)
    );
  }, [customAliases, searchQuery]);

  const handleAddAlias = useCallback(() => {
    const newEntry: AliasEntry = {
      id: `new-${Date.now()}`,
      alias: '',
      target: '',
      isNew: true,
    };
    setCustomAliases((prev) => [...prev, newEntry]);
    setHasChanges(true);
  }, []);

  const handleRemoveAlias = useCallback((id: string) => {
    setCustomAliases((prev) => prev.filter((entry) => entry.id !== id));
    setHasChanges(true);
  }, []);

  const handleAliasChange = useCallback((id: string, field: 'alias' | 'target', newValue: string) => {
    setCustomAliases((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, [field]: newValue } : entry))
    );
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    // Convert entries back to record, filtering out empty entries
    const aliasRecord: Record<string, string> = {};
    for (const entry of customAliases) {
      if (entry.alias.trim() && entry.target.trim()) {
        aliasRecord[entry.alias.trim().toLowerCase()] = entry.target.trim();
      }
    }
    onChange(aliasRecord);
    onOpenChange(false);
  }, [customAliases, onChange, onOpenChange]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Locale Aliases</DialogTitle>
          <DialogDescription>
            Map external locale codes to your target locales. Custom aliases take priority over built-in mappings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Search Bar */}
          <div className="relative">
            <RiSearchLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search aliases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex max-h-[400px] flex-col gap-4 overflow-y-auto">
            {/* Custom Aliases Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-neutral-900">Custom Aliases</h4>
                {!isReadOnly && (
                  <Button type="button" variant="secondary" mode="outline" size="xs" onClick={handleAddAlias}>
                    <RiAddLine className="mr-1 h-4 w-4" />
                    Add Alias
                  </Button>
                )}
              </div>

              {filteredCustomAliases.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-500">
                  {customAliases.length === 0
                    ? 'No custom aliases configured. Add one to map external locale codes.'
                    : 'No custom aliases match your search.'}
                </div>
              ) : (
                <div className="rounded-lg border border-neutral-200">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50">
                        <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Alias</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Maps To</th>
                        <th className="w-10 px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomAliases.map((entry) => (
                        <tr key={entry.id} className="border-b border-neutral-100 last:border-b-0">
                          <td className="px-3 py-2">
                            <Input
                              type="text"
                              value={entry.alias}
                              onChange={(e) => handleAliasChange(entry.id, 'alias', e.target.value)}
                              placeholder="e.g., zh-hans"
                              disabled={isReadOnly}
                              className="h-8 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <LocaleSelect
                              value={entry.target}
                              onChange={(newValue) => handleAliasChange(entry.id, 'target', newValue)}
                              disabled={isReadOnly}
                              className="h-8"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {!isReadOnly && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => handleRemoveAlias(entry.id)}
                                className="h-8 w-8 p-0 text-neutral-400 hover:text-red-500"
                              >
                                <RiDeleteBinLine className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Separator />

            {/* Built-in Mappings Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-neutral-900">Built-in Mappings</h4>
                <span className="text-xs text-neutral-500">{filteredBuiltInMappings.length} mappings</span>
              </div>

              <div className="rounded-lg border border-neutral-200">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Alias</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500">Maps To</th>
                      <th className="w-20 px-3 py-2 text-right text-xs font-medium text-neutral-500">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBuiltInMappings.map(([alias, target]) => (
                      <tr key={alias} className="border-b border-neutral-100 last:border-b-0">
                        <td className="px-3 py-2">
                          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">{alias}</code>
                        </td>
                        <td className="px-3 py-2">
                          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">{target}</code>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-xs text-neutral-400">built-in</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" mode="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={handleSave} disabled={isReadOnly || !hasChanges}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
