import { ChannelTypeEnum, GeneratePreviewResponseDto } from '@novu/shared';
import { useMemo } from 'react';
import { useFetchTranslation } from '@/hooks/use-fetch-translation';
import { LocalizationResourceEnum } from '@/types/translations';

/**
 * Strip HTML tags from a string.
 * Used to clean up translated labels that may contain unwanted HTML wrapper tags.
 */
function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

/**
 * Try to parse TipTap JSON and convert to basic HTML.
 * This is a simplified renderer for email body translations.
 * Returns null if the content is not valid TipTap JSON.
 */
function renderTipTapToHtml(jsonContent: string): string | null {
  try {
    const doc = JSON.parse(jsonContent);
    if (doc.type !== 'doc' || !Array.isArray(doc.content)) {
      return null;
    }

    return renderNodes(doc.content);
  } catch {
    return null;
  }
}

/**
 * Recursively render TipTap nodes to HTML
 */
function renderNodes(nodes: unknown[]): string {
  return nodes
    .map((node) => {
      if (!node || typeof node !== 'object') return '';

      const n = node as Record<string, unknown>;
      const nodeType = n.type as string;
      const content = n.content as unknown[] | undefined;
      const attrs = n.attrs as Record<string, unknown> | undefined;

      switch (nodeType) {
        case 'paragraph': {
          const inner = content ? renderNodes(content) : '';
          return `<p>${inner}</p>`;
        }
        case 'text': {
          return String(n.text || '');
        }
        case 'variable': {
          // Render variables as styled pill similar to editor
          const id = attrs?.id as string;
          if (!id) return '';

          // Get display name (truncate long paths)
          const parts = id.split('.');
          const displayName = parts.length >= 3 ? '..' + parts.slice(-2).join('.') : id;

          // Styled to match the editor's variable pill appearance
          return `<span style="display: inline-flex; align-items: center; gap: 0.25em; padding: 1px 6px; margin: 0 2px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; font-family: monospace; font-size: 0.85em; color: #525252; vertical-align: middle;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" style="flex-shrink: 0;">
              <path d="M4 7h5l3 10 3-10h5M4 17h5l3-10 3 10h5"/>
            </svg>
            <span style="max-width: 20ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</span>
          </span>`;
        }
        case 'heading': {
          const level = (attrs?.level as number) || 1;
          const inner = content ? renderNodes(content) : '';
          return `<h${level}>${inner}</h${level}>`;
        }
        case 'bulletList': {
          const inner = content ? renderNodes(content) : '';
          return `<ul>${inner}</ul>`;
        }
        case 'orderedList': {
          const inner = content ? renderNodes(content) : '';
          return `<ol>${inner}</ol>`;
        }
        case 'listItem': {
          const inner = content ? renderNodes(content) : '';
          return `<li>${inner}</li>`;
        }
        case 'hardBreak':
          return '<br>';
        default: {
          // For unknown nodes, try to render content
          return content ? renderNodes(content) : '';
        }
      }
    })
    .join('');
}

type TranslatedPreviewParams = {
  previewData: GeneratePreviewResponseDto | null;
  selectedLocale: string;
  workflowId: string;
  stepId: string;
  defaultLocale?: string;
};

/**
 * Hook to apply translations to preview data based on selected locale.
 * This is used for ReNovu/self-hosted deployments where translations
 * are not applied on the backend during preview rendering.
 *
 * @param params - Parameters for translation
 * @returns Translated preview data
 */
export function useTranslatedPreview({
  previewData,
  selectedLocale,
  workflowId,
  stepId,
  defaultLocale = 'en_US',
}: TranslatedPreviewParams) {
  // Skip translation fetch if using default locale or missing required data
  const shouldFetchTranslation = Boolean(
    selectedLocale && selectedLocale !== defaultLocale && workflowId && stepId
  );

  const { data: translation, isLoading: isTranslationLoading } = useFetchTranslation({
    resourceId: workflowId,
    resourceType: LocalizationResourceEnum.WORKFLOW,
    locale: shouldFetchTranslation ? selectedLocale : '', // Empty locale disables the query
  });

  const translatedPreviewData = useMemo(() => {
    // If no preview data, return as is
    if (!previewData?.result?.preview) {
      return previewData;
    }

    // If using default locale or no translation available, return original
    if (!shouldFetchTranslation || !translation?.content || translation.isPlaceholder) {
      return previewData;
    }

    // Get the translation content
    const translationContent = translation.content as Record<string, string>;

    // Build translation keys based on step ID
    // Translation keys follow the pattern: step.{stepId}.{field}
    const subjectKey = `step.${stepId}.subject`;
    const bodyKey = `step.${stepId}.body`;
    const primaryActionLabelKey = `step.${stepId}.primaryAction.label`;
    const secondaryActionLabelKey = `step.${stepId}.secondaryAction.label`;

    // Get original preview
    const originalPreview = previewData.result.preview as Record<string, unknown>;

    // Apply translations if available
    const translatedPreview = { ...originalPreview };

    if (translationContent[subjectKey]) {
      translatedPreview.subject = translationContent[subjectKey];
    }

    // Handle body translation
    const channelType = previewData.result.type;
    const isEmailChannel = channelType === ChannelTypeEnum.EMAIL;

    if (translationContent[bodyKey]) {
      if (isEmailChannel) {
        // Email bodies are TipTap JSON - try to render to basic HTML
        const renderedHtml = renderTipTapToHtml(translationContent[bodyKey]);
        if (renderedHtml) {
          translatedPreview.body = renderedHtml;
        }
        // If rendering fails, keep original preview body
      } else {
        // Non-email channels use plain text body
        translatedPreview.body = translationContent[bodyKey];
      }
    }

    // Handle primary action translation
    // Strip HTML tags from labels since auto-translation may wrap them in <p> tags
    if (translationContent[primaryActionLabelKey] && originalPreview.primaryAction) {
      translatedPreview.primaryAction = {
        ...(originalPreview.primaryAction as Record<string, unknown>),
        label: stripHtmlTags(translationContent[primaryActionLabelKey]),
      };
    }

    // Handle secondary action translation
    if (translationContent[secondaryActionLabelKey] && originalPreview.secondaryAction) {
      translatedPreview.secondaryAction = {
        ...(originalPreview.secondaryAction as Record<string, unknown>),
        label: stripHtmlTags(translationContent[secondaryActionLabelKey]),
      };
    }

    return {
      ...previewData,
      result: {
        ...previewData.result,
        preview: translatedPreview,
      },
    };
  }, [previewData, shouldFetchTranslation, translation, stepId]);

  return {
    translatedPreviewData,
    isTranslationLoading: shouldFetchTranslation && isTranslationLoading,
  };
}
