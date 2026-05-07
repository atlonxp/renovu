import type { IAiSettingsLookup, IAiSettingsRecord } from "@novu/application-generic";
import { OpenAIModelEnum } from "../dal";
import { OpenAITranslationService } from "./openai-translation.service";
import { TranslationValidatorService } from "./translation-validator.service";
import { VariableTokenizerService } from "./variable-tokenizer.service";

// Mock OpenAI
jest.mock("openai", () => {
	return jest.fn().mockImplementation(() => ({
		chat: {
			completions: {
				create: jest.fn(),
			},
		},
	}));
});

describe("OpenAITranslationService", () => {
	let service: OpenAITranslationService;
	let aiSettingsRepository: jest.Mocked<IAiSettingsLookup>;
	let tokenizer: VariableTokenizerService;
	let validator: TranslationValidatorService;
	let mockOpenAI: jest.Mock;

	const mockSettings: IAiSettingsRecord = {
		_id: "settings_123",
		_organizationId: "org_123",
		provider: "openai",
		apiKey: "sk-test-key",
		model: OpenAIModelEnum.GPT_4O_MINI,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	beforeEach(() => {
		jest.clearAllMocks();

		// Create real instances of tokenizer and validator
		tokenizer = new VariableTokenizerService();
		validator = new TranslationValidatorService();

		aiSettingsRepository = {
			findByOrganization: jest.fn(),
		} as jest.Mocked<IAiSettingsLookup>;

		// Get the mocked OpenAI class
		mockOpenAI = require("openai");

		service = new OpenAITranslationService(
			aiSettingsRepository,
			tokenizer,
			validator,
		);
	});

	describe("translate", () => {
		it("should translate content successfully", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			// Mock OpenAI response
			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "Hola [VAR_1]!" } }],
				usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello {{name}}!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(true);
			expect(result.translated).toBe("Hola {{name}}!");
			expect(result.metadata?.model).toBe(OpenAIModelEnum.GPT_4O_MINI);
			expect(result.metadata?.totalTokens).toBe(60);
		});

		it("should fail when API key is not configured", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(null);

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello World!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("API key not configured");
		});

		it("should fail when settings have no API key", async () => {
			const settingsWithoutKey = { ...mockSettings, apiKey: "" };
			aiSettingsRepository.findByOrganization.mockResolvedValue(
				settingsWithoutKey,
			);

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello World!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("API key not configured");
		});

		it("should handle empty response from OpenAI", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "" } }],
				usage: { prompt_tokens: 50, completion_tokens: 0, total_tokens: 50 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello World!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("Empty response");
		});

		it("should preserve HTML structure", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [
					{
						message: {
							content: '<div class="greeting"><p>Hola [VAR_1]!</p></div>',
						},
					},
				],
				usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: '<div class="greeting"><p>Hello {{name}}!</p></div>',
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(true);
			expect(result.translated).toBe(
				'<div class="greeting"><p>Hola {{name}}!</p></div>',
			);
			expect(result.translated).toContain('class="greeting"');
		});

		it("should handle multiple variables", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "Hola [VAR_1] [VAR_2]!" } }],
				usage: { prompt_tokens: 60, completion_tokens: 15, total_tokens: 75 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello {{firstName}} {{lastName}}!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(true);
			expect(result.translated).toBe("Hola {{firstName}} {{lastName}}!");
		});

		it("should skip validation when requested", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "Hola!" } }],
				usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
				skipValidation: true,
			});

			expect(result.success).toBe(true);
			expect(result.validation).toBeUndefined();
		});

		it("should include validation when not skipped", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "Hola!" } }],
				usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(true);
			expect(result.validation).toBeDefined();
			expect(result.validation?.valid).toBe(true);
		});

		it("should handle API errors gracefully", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest
				.fn()
				.mockRejectedValue(new Error("API Error: 500 Internal Server Error"));
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it("should use default model when not specified", async () => {
			const settingsWithoutModel = {
				...mockSettings,
				model: "" as string,
			};
			aiSettingsRepository.findByOrganization.mockResolvedValue(
				settingsWithoutModel,
			);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "Hola!" } }],
				usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(true);
			expect(result.metadata?.model).toBe(OpenAIModelEnum.GPT_4O_MINI);
		});

		it("should handle content type hint", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "Hola!" } }],
				usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translate({
				organizationId: "org_123",
				content: "Hello!",
				sourceLocale: "en_US",
				targetLocale: "es_ES",
				contentType: "email",
			});

			expect(result.success).toBe(true);
			// Verify the prompt included content type
			const callArgs = mockCreate.mock.calls[0][0];
			expect(callArgs.messages[1].content).toContain("email");
		});
	});

	describe("translateBatch", () => {
		it("should translate multiple items successfully", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			let callCount = 0;
			const mockCreate = jest.fn().mockImplementation(() => {
				callCount++;
				return Promise.resolve({
					choices: [
						{ message: { content: callCount === 1 ? "Hola!" : "Adios!" } },
					],
					usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
				});
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translateBatch({
				organizationId: "org_123",
				items: [
					{ id: "item1", content: "Hello!" },
					{ id: "item2", content: "Goodbye!" },
				],
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(true);
			expect(result.results.length).toBe(2);
			expect(result.results[0].id).toBe("item1");
			expect(result.results[0].success).toBe(true);
			expect(result.results[1].id).toBe("item2");
			expect(result.results[1].success).toBe(true);
			expect(result.metadata?.successfulItems).toBe(2);
			expect(result.metadata?.failedItems).toBe(0);
		});

		it("should handle partial failures", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			let callCount = 0;
			const mockCreate = jest.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({
						choices: [{ message: { content: "Hola!" } }],
						usage: {
							prompt_tokens: 50,
							completion_tokens: 10,
							total_tokens: 60,
						},
					});
				}
				return Promise.reject(new Error("API Error"));
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translateBatch({
				organizationId: "org_123",
				items: [
					{ id: "item1", content: "Hello!" },
					{ id: "item2", content: "Goodbye!" },
				],
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.success).toBe(false);
			expect(result.results[0].success).toBe(true);
			expect(result.results[1].success).toBe(false);
			expect(result.metadata?.successfulItems).toBe(1);
			expect(result.metadata?.failedItems).toBe(1);
		});

		it("should track total tokens across batch", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "Hola!" } }],
				usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.translateBatch({
				organizationId: "org_123",
				items: [
					{ id: "item1", content: "Hello!" },
					{ id: "item2", content: "Goodbye!" },
					{ id: "item3", content: "Thanks!" },
				],
				sourceLocale: "en_US",
				targetLocale: "es_ES",
			});

			expect(result.metadata?.totalTokens).toBe(180); // 60 * 3
		});
	});

	describe("testConnection", () => {
		it("should return success for valid connection", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "OK" } }],
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.testConnection("org_123");

			expect(result.success).toBe(true);
			expect(result.model).toBe(OpenAIModelEnum.GPT_4O_MINI);
			expect(result.latencyMs).toBeDefined();
		});

		it("should return failure when API key not configured", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(null);

			const result = await service.testConnection("org_123");

			expect(result.success).toBe(false);
			expect(result.error).toContain("not configured");
		});

		it("should handle invalid API key error", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest
				.fn()
				.mockRejectedValue(new Error("401 invalid_api_key"));
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.testConnection("org_123");

			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid API key");
		});

		it("should handle rate limit error", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest
				.fn()
				.mockRejectedValue(new Error("429 rate limit exceeded"));
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.testConnection("org_123");

			expect(result.success).toBe(false);
			expect(result.error).toContain("Rate limit");
		});

		it("should handle empty response", async () => {
			aiSettingsRepository.findByOrganization.mockResolvedValue(mockSettings);

			const mockCreate = jest.fn().mockResolvedValue({
				choices: [{ message: { content: "" } }],
			});
			mockOpenAI.mockImplementation(() => ({
				chat: { completions: { create: mockCreate } },
			}));

			const result = await service.testConnection("org_123");

			expect(result.success).toBe(false);
			expect(result.error).toContain("Empty response");
		});
	});

	describe("getLocaleName", () => {
		it("should return locale display name", () => {
			expect(service.getLocaleName("en_US")).toBe("English (US)");
			expect(service.getLocaleName("es_ES")).toBe("Spanish (Spain)");
			expect(service.getLocaleName("ja_JP")).toBe("Japanese");
		});

		it("should return locale code for unknown locales", () => {
			expect(service.getLocaleName("xx_XX")).toBe("xx_XX");
		});
	});

	describe("getSupportedLocales", () => {
		it("should return supported locales", () => {
			const locales = service.getSupportedLocales();

			expect(Object.keys(locales).length).toBeGreaterThan(0);
			expect(locales["en_US"]).toBe("English (US)");
			expect(locales["es_ES"]).toBe("Spanish (Spain)");
		});
	});
});
