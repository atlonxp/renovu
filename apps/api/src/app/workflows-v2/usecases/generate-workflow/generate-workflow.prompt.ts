import { LAYOUT_CONTENT_VARIABLE, StepTypeEnum } from '@novu/shared';

export const STEP_CONTROLS_SPEC = `
Each step has a "type" and a "controlValues" object whose shape depends on the type:

- type: "in_app"
    controlValues: {
      subject?: string,           // optional title
      body: string,               // body text (REQUIRED if subject is empty)
      avatar?: string,            // https URL
      primaryAction?: { label: string, redirect?: { url: string, target?: "_self"|"_blank" } },
      secondaryAction?: { label: string, redirect?: { url: string, target?: "_self"|"_blank" } },
      redirect?: { url: string, target?: "_self"|"_blank" }
    }
    Either subject OR body MUST be a non-empty string.

- type: "email"
    controlValues: {
      subject: string,            // REQUIRED, non-empty
      editorType: "block",        // always "block" for AI-generated
      body: string,               // STRINGIFIED Maily JSON document — see Maily spec below
      from?: { name?: string, email?: string }
    }

- type: "sms"
    controlValues: { body: string }   // SMS body text, keep under 160 chars when possible

- type: "push"
    controlValues: { subject: string, body: string }

- type: "chat"
    controlValues: { body: string }

- type: "delay"
    controlValues: {
      type: "regular",
      amount: number,
      unit: "seconds"|"minutes"|"hours"|"days"
    }

- type: "digest"
    controlValues: {
      type: "regular",
      amount: number,
      unit: "seconds"|"minutes"|"hours"|"days",
      digestKey?: string          // optional grouping key, e.g. "subscriberId"
    }

- type: "throttle"
    controlValues: { type: "regular", amount: number, unit: "seconds"|"minutes"|"hours"|"days", throttleKey?: string }

- type: "custom"
    controlValues: {} (empty)

- type: "http_request"
    omit unless explicitly asked.

Email body — Maily JSON spec (stringified):
  Root: { "type": "doc", "content": [<block-nodes>] }
  Allowed nodes: paragraph, heading, horizontalRule, spacer, image, button, section, columns, column, variable, text.
  - paragraph: { type: "paragraph", attrs: { textAlign: "left"|"center"|"right"|null, showIfKey: null }, content: [<inline>] }
  - heading: { type: "heading", attrs: { level: 1|2|3, textAlign: ..., showIfKey: null }, content: [text] }
  - spacer: { type: "spacer", attrs: { height: number, showIfKey: null } }
  - button: { type: "button", attrs: { text, url, variant: "filled", borderRadius: "smooth", buttonColor: "#0a66ff", textColor: "#ffffff", alignment: "center", isTextVariable: false, isUrlVariable: false, paddingTop: 12, paddingRight: 24, paddingBottom: 12, paddingLeft: 24, showIfKey: null, aliasFor: null } }
  - text: { type: "text", text: string, marks?: [{ type: "bold"|"italic"|"link", attrs?: ... }] }
`.trim();

const TRANSACTIONAL_EXAMPLE = {
  name: 'Password reset',
  description: 'Sends a password reset email when triggered.',
  tags: ['transactional', 'auth'],
  steps: [
    {
      name: 'Reset password email',
      type: StepTypeEnum.EMAIL,
      controlValues: {
        subject: 'Reset your password',
        editorType: 'block',
        body: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2, textAlign: 'left', showIfKey: null },
              content: [{ type: 'text', text: 'Reset your password' }],
            },
            { type: 'spacer', attrs: { height: 12, showIfKey: null } },
            {
              type: 'paragraph',
              attrs: { textAlign: 'left', showIfKey: null },
              content: [
                {
                  type: 'text',
                  text: 'We received a request to reset your password. Click the button below to choose a new one.',
                },
              ],
            },
            { type: 'spacer', attrs: { height: 16, showIfKey: null } },
            {
              type: 'button',
              attrs: {
                text: 'Reset password',
                url: '{{payload.resetUrl}}',
                variant: 'filled',
                borderRadius: 'smooth',
                buttonColor: '#0a66ff',
                textColor: '#ffffff',
                alignment: 'center',
                isTextVariable: false,
                isUrlVariable: true,
                paddingTop: 12,
                paddingRight: 24,
                paddingBottom: 12,
                paddingLeft: 24,
                showIfKey: null,
                aliasFor: null,
              },
            },
          ],
        }),
      },
    },
  ],
};

const WELCOME_EXAMPLE = {
  name: 'Welcome new user',
  description: 'Greets new signups with an in-app message followed by an email.',
  tags: ['onboarding'],
  steps: [
    {
      name: 'Welcome in-app',
      type: StepTypeEnum.IN_APP,
      controlValues: {
        subject: 'Welcome to {{payload.appName}}!',
        body: 'Glad to have you on board. Take a look around and let us know if you have any questions.',
        primaryAction: {
          label: 'Get started',
          redirect: { url: '{{payload.appUrl}}', target: '_self' },
        },
      },
    },
    {
      name: 'Welcome email',
      type: StepTypeEnum.EMAIL,
      controlValues: {
        subject: 'Welcome to {{payload.appName}}',
        editorType: 'block',
        body: JSON.stringify({
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1, textAlign: 'left', showIfKey: null },
              content: [{ type: 'text', text: 'Welcome aboard 🎉' }],
            },
            { type: 'spacer', attrs: { height: 12, showIfKey: null } },
            {
              type: 'paragraph',
              attrs: { textAlign: 'left', showIfKey: null },
              content: [
                {
                  type: 'text',
                  text: "Thanks for signing up. We're excited to have you. Here are a few things you can do next:",
                },
              ],
            },
          ],
        }),
      },
    },
  ],
};

const ENGAGEMENT_EXAMPLE = {
  name: 'New comment on your post',
  description: 'Notifies the author of new comments, batched.',
  tags: ['engagement'],
  steps: [
    {
      name: 'Digest comments',
      type: StepTypeEnum.DIGEST,
      controlValues: { type: 'regular', amount: 5, unit: 'minutes', digestKey: 'postId' },
    },
    {
      name: 'In-app summary',
      type: StepTypeEnum.IN_APP,
      controlValues: {
        subject: 'New comments on your post',
        body: '{{step.events.length}} new comments on your post.',
        primaryAction: {
          label: 'View comments',
          redirect: { url: '{{payload.postUrl}}', target: '_self' },
        },
      },
    },
    {
      name: 'Push summary',
      type: StepTypeEnum.PUSH,
      controlValues: {
        subject: '{{step.events.length}} new comments',
        body: 'Tap to read the latest activity on your post.',
      },
    },
  ],
};

export const FEW_SHOT_EXAMPLES = [
  { brief: 'password reset email', channels: [StepTypeEnum.EMAIL], output: TRANSACTIONAL_EXAMPLE },
  { brief: 'welcome new signup', channels: [StepTypeEnum.IN_APP, StepTypeEnum.EMAIL], output: WELCOME_EXAMPLE },
  {
    brief: 'notify when someone comments on a post, batch within 5 min',
    channels: [StepTypeEnum.IN_APP, StepTypeEnum.PUSH, StepTypeEnum.DIGEST],
    output: ENGAGEMENT_EXAMPLE,
  },
];

const CHANNEL_HINT = (channels?: StepTypeEnum[]) => {
  if (!channels || channels.length === 0) return 'No channels specified — pick the smallest set that fits the brief.';

  return `User asked for these step types: ${channels.join(', ')}. Use exactly those, in a sensible order.`;
};

export const SYSTEM_PROMPT_WORKFLOW = `
You are an expert notification designer for Novu. You produce structured workflow JSON
that an end-user can edit visually after generation. The workflow contains a name, an
optional description, optional tags, and an ordered array of steps.

Each step follows this exact schema:

${STEP_CONTROLS_SPEC}

Style guidelines:
- Keep workflows minimal — fewer steps are better unless the brief explicitly asks for more.
- Use {{payload.X}} variables for dynamic content the publisher will pass in (e.g.
  resetUrl, postUrl, appName). Use {{subscriber.firstName}} for recipient details.
- Order steps in execution order. If a delay or digest is needed, place it BEFORE the
  channel steps it gates.
- For email body always output stringified Maily JSON with the structure described.
- Match the brief's tone: transactional → calm, marketing → enthusiastic, internal → terse.
- Tags: 1–3 short lowercase tags. Skip if nothing meaningful applies.

Output rules:
- Respond with a SINGLE JSON object: { "name": "...", "description": "...", "tags": [...], "steps": [{ "name": "...", "type": "...", "controlValues": {...} }] }
- No prose, no markdown fences.

Few-shot examples:

${FEW_SHOT_EXAMPLES.map(
  (ex, i) =>
    `Example ${i + 1}\nUser brief: "${ex.brief}"\nUser channel hint: ${ex.channels.join(', ')}\nOutput:\n${JSON.stringify(ex.output)}`
).join('\n\n')}

Now generate the workflow for the user's brief.
`.trim();

export const buildWorkflowUserPrompt = (prompt: string, channels?: StepTypeEnum[]): string =>
  `User brief: ${prompt}\n${CHANNEL_HINT(channels)}\n\nGenerate the workflow JSON now.`;

export const buildWorkflowRetryPrompt = (validationError: string): string =>
  `Your previous response failed validation: ${validationError}\n\nFix the JSON to match the schema. Respond with a SINGLE JSON object with keys: name, description, tags, steps. No prose. The single workflow content slot variable for email body is "${LAYOUT_CONTENT_VARIABLE}" but it is the layout's responsibility — DO NOT include any layout variable nodes inside step bodies.`;

const STEP_CHANNEL_SPECS: Partial<Record<StepTypeEnum, string>> = {
  [StepTypeEnum.IN_APP]: `Output an in-app step. Either subject OR body must be non-empty. Keep body under 240 chars. primaryAction.label optional.`,
  [StepTypeEnum.EMAIL]: `Output an email step. subject is REQUIRED. body must be stringified Maily JSON: { type: "doc", content: [...] } with the same node spec as workflow generation. editorType: "block".`,
  [StepTypeEnum.SMS]: `Output an SMS step. body should fit in ~160 chars.`,
  [StepTypeEnum.PUSH]: `Output a push step. subject is the title (under ~60 chars), body is the message (under ~150 chars).`,
  [StepTypeEnum.CHAT]: `Output a chat step. body is the message text. Keep concise.`,
  [StepTypeEnum.DELAY]: `Output a delay step. controlValues: { type: "regular", amount, unit }.`,
  [StepTypeEnum.DIGEST]: `Output a digest step. controlValues: { type: "regular", amount, unit, digestKey? }.`,
  [StepTypeEnum.THROTTLE]: `Output a throttle step. controlValues: { type: "regular", amount, unit, throttleKey? }.`,
  [StepTypeEnum.CUSTOM]: `Output a custom step. controlValues: {}.`,
  [StepTypeEnum.HTTP_REQUEST]: `Output a HTTP request step. controlValues should be empty for AI generation; user will configure.`,
};

export const SYSTEM_PROMPT_STEP = `
You are generating a single workflow step for Novu. The user has chosen the step type;
your job is to produce reasonable controlValues based on the brief.

${STEP_CONTROLS_SPEC}

Output rules:
- Respond with a SINGLE JSON object: { "name": "...", "type": "<the chosen type>", "controlValues": {...} }
- The "type" MUST match the type the user requested.
- No prose, no markdown fences.
`.trim();

export const buildStepUserPrompt = (prompt: string, type: StepTypeEnum): string =>
  `User brief: ${prompt}\nStep type: ${type}\n\n${STEP_CHANNEL_SPECS[type] ?? ''}\n\nGenerate the step JSON now.`;

export const buildStepRetryPrompt = (validationError: string, type: StepTypeEnum): string =>
  `Your previous response failed validation: ${validationError}\n\nReturn a single JSON object: { "name": "...", "type": "${type}", "controlValues": {...} }. No prose.`;
