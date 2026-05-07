import { LAYOUT_CONTENT_VARIABLE } from '@novu/shared';

export const MAILY_NODE_SPEC = `
You output Maily JSON — Novu's native email-document format. The document root is always:
  { "type": "doc", "content": [<block-nodes>] }

Allowed block-level node types and their attribute keys:

- paragraph
    attrs: { textAlign: "left"|"center"|"right"|null, showIfKey: string|null }
    content: array of inline nodes (text, variable, inlineImage)
- heading
    attrs: { level: 1|2|3, textAlign: "left"|"center"|"right"|null, showIfKey: string|null }
    content: array of text nodes
- horizontalRule
    attrs: { showIfKey: string|null }
- spacer
    attrs: { height: number (px), showIfKey: string|null }
- image
    attrs: {
      src: string (https URL), alt: string|null, title: string|null,
      width: string|number, height: string|number,
      alignment: "left"|"center"|"right",
      externalLink: string|null, isExternalLinkVariable: false,
      borderRadius: number, isSrcVariable: false,
      aspectRatio: number|null, lockAspectRatio: true,
      showIfKey: string|null, aliasFor: null
    }
- button
    attrs: {
      text: string, url: string,
      variant: "filled"|"outline", borderRadius: "sharp"|"smooth"|"round",
      buttonColor: string (hex), textColor: string (hex),
      alignment: "left"|"center"|"right",
      isTextVariable: false, isUrlVariable: false,
      paddingTop: number, paddingRight: number, paddingBottom: number, paddingLeft: number,
      showIfKey: string|null, aliasFor: null
    }
- section
    attrs: {
      borderRadius: number, backgroundColor: string (hex), align: "left"|"center"|"right",
      borderWidth: number, borderColor: string (hex),
      paddingTop: number, paddingRight: number, paddingBottom: number, paddingLeft: number,
      marginTop: number, marginRight: number, marginBottom: number, marginLeft: number,
      showIfKey: string|null
    }
    content: array of block-level nodes
- columns
    attrs: { gap: number, showIfKey: string|null }
    content: array of "column" nodes only
- column
    attrs: {
      columnId: string (uuid v4),
      width: "auto"|number-as-string (percent without %, e.g. "50"),
      verticalAlign: "top"|"middle"|"bottom"
    }
    content: array of block-level nodes
- variable (inline)
    attrs: { id: string, label: string|null, fallback: string|null, required: boolean, aliasFor: null }
- text (inline)
    text: string
    marks: optional array of marks like { type: "bold" }, { type: "italic" }, { type: "textStyle" },
           { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow",
             class: null, isUrlVariable: false, aliasFor: null } }

Hard rules:
1. The document MUST contain EXACTLY ONE variable node with attrs.id = "${LAYOUT_CONTENT_VARIABLE}".
   It marks the slot where the workflow step's body content gets injected. Place it
   between the layout's header chrome and footer chrome.
2. Use only the node types listed above. Never invent attributes.
3. All image src URLs must be https and resolvable in production.
4. Output a SINGLE JSON object: { "body": <doc>, "container": { "maxWidth": "...",
   "align": "left"|"center"|"right", "padding": "..." } }. No prose, no markdown.
   maxWidth values: "400px" (compact), "600px" (standard), "800px" (wide), "100%" (full).
`.trim();

const TRANSACTIONAL_EXAMPLE = {
  body: {
    type: 'doc',
    content: [
      {
        type: 'image',
        attrs: {
          src: 'https://prod-novu-app-bucket.s3.us-east-1.amazonaws.com/assets/email-editor/logo.png',
          alt: null,
          title: null,
          width: '48',
          height: '48',
          alignment: 'left',
          externalLink: null,
          isExternalLinkVariable: false,
          borderRadius: 0,
          isSrcVariable: false,
          aspectRatio: null,
          lockAspectRatio: true,
          showIfKey: null,
          aliasFor: null,
        },
      },
      { type: 'spacer', attrs: { height: 16, showIfKey: null } },
      {
        type: 'heading',
        attrs: { level: 2, textAlign: 'left', showIfKey: null },
        content: [{ type: 'text', text: 'Reset your password' }],
      },
      { type: 'spacer', attrs: { height: 8, showIfKey: null } },
      {
        type: 'paragraph',
        attrs: { textAlign: 'left', showIfKey: null },
        content: [
          {
            type: 'variable',
            attrs: { id: LAYOUT_CONTENT_VARIABLE, label: null, fallback: null, required: false, aliasFor: null },
          },
        ],
      },
      { type: 'spacer', attrs: { height: 16, showIfKey: null } },
      { type: 'horizontalRule', attrs: { showIfKey: null } },
      {
        type: 'paragraph',
        attrs: { textAlign: 'left', showIfKey: null },
        content: [
          {
            type: 'text',
            marks: [{ type: 'textStyle' }],
            text: 'If you did not request this, you can safely ignore this email.',
          },
        ],
      },
    ],
  },
  container: { maxWidth: '600px', align: 'center', padding: '1rem' },
};

const MARKETING_EXAMPLE = {
  body: {
    type: 'doc',
    content: [
      {
        type: 'image',
        attrs: {
          src: 'https://prod-novu-app-bucket.s3.us-east-1.amazonaws.com/assets/email-editor/logo.png',
          alt: null,
          title: null,
          width: '64',
          height: '64',
          alignment: 'center',
          externalLink: null,
          isExternalLinkVariable: false,
          borderRadius: 0,
          isSrcVariable: false,
          aspectRatio: null,
          lockAspectRatio: true,
          showIfKey: null,
          aliasFor: null,
        },
      },
      { type: 'spacer', attrs: { height: 16, showIfKey: null } },
      {
        type: 'heading',
        attrs: { level: 1, textAlign: 'center', showIfKey: null },
        content: [{ type: 'text', text: 'Your trial is ending soon' }],
      },
      { type: 'spacer', attrs: { height: 12, showIfKey: null } },
      {
        type: 'paragraph',
        attrs: { textAlign: 'center', showIfKey: null },
        content: [
          {
            type: 'variable',
            attrs: { id: LAYOUT_CONTENT_VARIABLE, label: null, fallback: null, required: false, aliasFor: null },
          },
        ],
      },
      { type: 'spacer', attrs: { height: 20, showIfKey: null } },
      {
        type: 'button',
        attrs: {
          text: 'Upgrade now',
          url: 'https://example.com/upgrade',
          variant: 'filled',
          borderRadius: 'smooth',
          buttonColor: '#0a66ff',
          textColor: '#ffffff',
          alignment: 'center',
          isTextVariable: false,
          isUrlVariable: false,
          paddingTop: 12,
          paddingRight: 24,
          paddingBottom: 12,
          paddingLeft: 24,
          showIfKey: null,
          aliasFor: null,
        },
      },
      { type: 'spacer', attrs: { height: 16, showIfKey: null } },
    ],
  },
  container: { maxWidth: '600px', align: 'center', padding: '1.25rem' },
};

const NEWSLETTER_EXAMPLE = {
  body: {
    type: 'doc',
    content: [
      {
        type: 'columns',
        attrs: { gap: 8, showIfKey: null },
        content: [
          {
            type: 'column',
            attrs: { columnId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', width: 'auto', verticalAlign: 'middle' },
            content: [
              {
                type: 'image',
                attrs: {
                  src: 'https://prod-novu-app-bucket.s3.us-east-1.amazonaws.com/assets/email-editor/logo.png',
                  alt: null,
                  title: null,
                  width: '40',
                  height: '40',
                  alignment: 'left',
                  externalLink: null,
                  isExternalLinkVariable: false,
                  borderRadius: 0,
                  isSrcVariable: false,
                  aspectRatio: null,
                  lockAspectRatio: true,
                  showIfKey: null,
                  aliasFor: null,
                },
              },
            ],
          },
          {
            type: 'column',
            attrs: { columnId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', width: 'auto', verticalAlign: 'middle' },
            content: [
              {
                type: 'paragraph',
                attrs: { textAlign: 'right', showIfKey: null },
                content: [{ type: 'text', text: 'Monthly digest' }],
              },
            ],
          },
        ],
      },
      { type: 'spacer', attrs: { height: 16, showIfKey: null } },
      {
        type: 'heading',
        attrs: { level: 1, textAlign: 'left', showIfKey: null },
        content: [{ type: 'text', text: 'This month at a glance' }],
      },
      { type: 'spacer', attrs: { height: 12, showIfKey: null } },
      {
        type: 'paragraph',
        attrs: { textAlign: 'left', showIfKey: null },
        content: [
          {
            type: 'variable',
            attrs: { id: LAYOUT_CONTENT_VARIABLE, label: null, fallback: null, required: false, aliasFor: null },
          },
        ],
      },
      { type: 'spacer', attrs: { height: 16, showIfKey: null } },
      { type: 'horizontalRule', attrs: { showIfKey: null } },
      {
        type: 'paragraph',
        attrs: { textAlign: 'center', showIfKey: null },
        content: [{ type: 'text', text: 'You are receiving this because you subscribed to our newsletter.' }],
      },
    ],
  },
  container: { maxWidth: '800px', align: 'center', padding: '1rem' },
};

export const FEW_SHOT_EXAMPLES = [
  { brief: 'password reset email', output: TRANSACTIONAL_EXAMPLE },
  { brief: 'free trial ending in 3 days', output: MARKETING_EXAMPLE },
  { brief: 'monthly product newsletter', output: NEWSLETTER_EXAMPLE },
];

export const SYSTEM_PROMPT = `
You are an expert email designer that produces structured email layouts in Novu's
Maily JSON format. You return a populated layout body skeleton that an end-user can
later edit visually. The body is the SHELL of the email — header chrome, framing,
and footer chrome — with a single content slot variable where dynamic per-send body
copy gets injected at runtime.

${MAILY_NODE_SPEC}

Style guidelines:
- Keep layouts clean and conventional. Header → optional hero → optional headline →
  content slot variable → optional CTA → footer.
- Use spacers liberally between blocks (8-24px).
- Match the brief's tone: transactional layouts are calm and minimal, marketing
  layouts can use a hero image and a CTA button, newsletters can use multi-column
  headers.
- For images, default to https://prod-novu-app-bucket.s3.us-east-1.amazonaws.com/assets/email-editor/logo.png
  unless the user explicitly mentions a brand asset.
- Pick a container preset that fits the type:
  - transactional → 600px / center / 1rem
  - marketing    → 600px / center / 1.25rem
  - newsletter   → 800px / center / 1rem
  - announcement → 600px / center / 1rem
  - compact      → 400px / center / 0.75rem

Few-shot examples (input brief → output JSON):

${FEW_SHOT_EXAMPLES.map(
  (ex, i) =>
    `Example ${i + 1}\nUser brief: "${ex.brief}"\nOutput:\n${JSON.stringify(ex.output)}`
).join('\n\n')}

Now generate a layout for the user's brief. Respond with a SINGLE JSON object of
the form { "body": <doc>, "container": <container-config> }. No prose, no markdown.
`.trim();

export const buildUserPrompt = (prompt: string): string =>
  `User brief: ${prompt}\n\nGenerate the layout JSON now.`;

export const buildRetryPrompt = (validationError: string): string =>
  `Your previous response failed validation: ${validationError}\n\nFix the JSON to match the schema. Respond with a SINGLE JSON object: { "body": <maily-doc>, "container": <container-config> }. The doc must include exactly one variable node with attrs.id = "${LAYOUT_CONTENT_VARIABLE}". No prose.`;
