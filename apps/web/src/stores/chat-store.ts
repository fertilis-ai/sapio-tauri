import { create } from "zustand";
import { v4 as uuid } from "uuid";
import {
  streamSimple,
  getModel,
  type Context,
  type Api,
  type Model,
  type ThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  type ToolCallState,
  type ToolCallStatus,
  getToolsForContext,
  normalizeToolCallStatus,
} from "@/lib/tools";
import { stripProtocolMarkers } from "@/lib/protocol-parser";
import { messagesToPiMessages } from "@/lib/message-conversion";
import { computeContextBudget, type ContextBudget } from "@/lib/context/token-estimate";
import { trimMessagesToBudget } from "@/lib/context/trim";
import { classifyError } from "@/lib/agentic/types";
import { resolveMemories } from "@/lib/memory/resolve-memories";
import { resolveSkills, renderSkillsForPrompt } from "@/lib/skills/resolve-skills";
import { buildToolboxInventory } from "@/lib/toolbox/toolbox-inventory";
import { renderToolboxFormatReference } from "@/lib/toolbox/toolbox-schemas";
import { useSettingsStore } from "./settings-store";
import { useAgentStore } from "./agent-store";
import { useAgenticLoopStore, subscribeToToolEvents } from "./agentic-loop-store";
import type { AgentLoopEvent } from "@/lib/agentic/types";
import type { VerbalisAdapterConfig } from "@/lib/agentic/verbalis-agent-adapter";
import type { GuardrailsConfig } from "@/lib/guardrails/types";
import { appFetch } from "@/lib/http";
import { getActiveModels, PROVIDER_API_MAP, PROVIDER_BASE_URL_MAP, type ModelId, type ChatModelId } from "@/lib/models";
import {
  getEffortCapability,
  resolveEffortFor,
  toReasoningOption,
  type EffortCapability,
} from "@/lib/reasoning";
import {
  loadChatTree,
  loadChatByPath,
  saveChatToFolder,
  deleteChatByPath,
  deleteChatFolder,
  renameChatFolder,
  createChatFolder,
  saveFolderMeta,
  loadFolderMeta,
  deletePath,
  getAppDataDir,
  isTauri,
  readFile,
  renamePath,
  type ChatTreeNode,
  type ChatFolderMeta,
  type ChatData,
} from "@/lib/storage";
import { logAgent } from "@/lib/logger";
import { findNodeInTree, getUniqueName, getSiblingFolderNames } from "@/lib/tree-utils";
import { toggleInSet } from "@/lib/set-utils";
import { normalizeBaseUrl, buildOpenAiBaseUrl, buildOpenAiUrl } from "@/lib/url-utils";

/** Resolve a model ID to its pi-ai Model object, provider, and API key. */
function resolveModelObject(
  modelId: string,
  apiKeys: Record<string, string>,
  selectedModels?: import("@/lib/models").ProviderModel[]
): {
  modelObj: Model<Api>;
  provider: string;
  apiKey: string;
  capability: EffortCapability | null;
} | null {
  const active = getActiveModels(selectedModels);
  const entry = active.find((m) => m.id === modelId);
  if (!entry) return null;

  const apiKey = apiKeys[entry.provider as keyof typeof apiKeys];
  if (!apiKey) return null;

  // Reasoning comes from OpenRouter's per-model metadata and nothing else, and
  // is always stamped onto the model — in both directions.
  //
  // Stamping the positive case is what makes the request carry the effort at
  // all: pi-ai's OpenRouter branch is gated on `model.reasoning`, so a model
  // built with `reasoning: false` drops the option however the picker looked.
  //
  // Overwriting the negative case matters just as much. pi-ai's registry marks
  // 167 OpenRouter ids `reasoning: true` with a map of its own; for a model that
  // exposes no discrete levels (93 live ids, 21 of them `mandatory`) that branch
  // takes its `else` and sends `reasoning: { effort: "none" }`, silently
  // disabling reasoning on a model the user got no picker for. `reasoning:
  // false` sends no reasoning parameter instead, leaving the provider default.
  // Thinking output is unaffected — pi-ai parses it without consulting this flag.
  const capability = getEffortCapability(entry);
  const reasoningFields = capability
    ? { reasoning: true as const, thinkingLevelMap: capability.thinkingLevelMap }
    : { reasoning: false as const, thinkingLevelMap: undefined };

  // Try pi-ai's getModel() first (gives full config with cost/context data)
  const registryModel = getModel(entry.provider as "anthropic", modelId as "claude-sonnet-4-20250514");
  if (registryModel) {
    // OpenRouter needs explicit auth header (Tauri fetch may strip SDK-managed auth on redirect)
    if (entry.provider === "openrouter") {
      return {
        modelObj: {
          ...registryModel,
          ...reasoningFields,
          headers: { ...registryModel.headers, "Authorization": `Bearer ${apiKey}` },
          compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
          },
        },
        provider: entry.provider,
        apiKey,
        capability,
      };
    }
    return { modelObj: registryModel, provider: entry.provider, apiKey, capability };
  }

  const api = PROVIDER_API_MAP[entry.provider];
  if (!api) return null;

  // Default base URLs for each provider
  const defaultBaseUrls: Record<string, string> = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com/v1",
    google: "https://generativelanguage.googleapis.com/v1beta",
    openrouter: "https://openrouter.ai/api/v1",
  };
  const baseUrl = PROVIDER_BASE_URL_MAP[entry.provider] ?? defaultBaseUrls[entry.provider] ?? "";
  const modelObj: Model<Api> = {
    id: modelId,
    name: entry.name,
    api: api as Api,
    provider: entry.provider,
    baseUrl,
    ...reasoningFields,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };

  // Add explicit auth header for OpenRouter (Tauri fetch may strip SDK-managed auth on redirect)
  if (entry.provider === "openrouter") {
    modelObj.headers = { "Authorization": `Bearer ${apiKey}` };
    modelObj.compat = {
      supportsStore: false,
      supportsDeveloperRole: false,
    };
  }

  return { modelObj, provider: entry.provider, apiKey, capability };
}

import type { LocalLlmProvider } from "./settings-store";

function buildContextFromConversation(params: {
  conversation: Conversation;
  systemPrompt?: string;
  api: Api;
  provider: string;
  model: string;
  includeTools?: boolean;
}): Context {
  const { conversation, systemPrompt, api, provider, model, includeTools } = params;
  return {
    systemPrompt,
    messages: messagesToPiMessages(conversation.messages, api, provider, model),
    tools: includeTools ? getToolsForContext() : undefined,
  };
}

async function resolveLocalModel(provider: LocalLlmProvider, baseUrl: string, fallback?: string) {
  if (fallback?.trim()) return fallback.trim();
  try {
    const url = buildOpenAiUrl(baseUrl, "/models");
    const response = await appFetch(url);
    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id?: string }> };
      const modelId = data?.data?.[0]?.id ?? null;
      if (modelId) return modelId;
    }
    if (provider === "ollama") {
      const ollamaUrl = `${normalizeBaseUrl(baseUrl)}/api/tags`;
      const ollamaResponse = await appFetch(ollamaUrl);
      if (!ollamaResponse.ok) return null;
      const data = (await ollamaResponse.json()) as { models?: Array<{ name?: string }> };
      return data?.models?.[0]?.name ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function buildLocalModel(params: { provider: LocalLlmProvider; baseUrl: string; model: string }): Model<"openai-completions"> {
  const baseUrl = buildOpenAiBaseUrl(params.baseUrl);
  return {
    id: params.model,
    name: params.model,
    api: "openai-completions",
    provider: params.provider,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
  };
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallState[];
  createdAt: Date;
}

export type { ToolCallState, ToolCallStatus };

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  // File system location
  path?: string;
  folderId?: string;
  // Background conversations are hidden from the chat sidebar (e.g. scheduler runs)
  background?: boolean;
}

export interface ContextFile {
  path: string;
  name: string;
  content: string;
}

interface ChatState {
  // Conversations (in-memory + synced to disk)
  conversations: Conversation[];
  currentConversationId: string | null;

  // Derived getter for current conversation
  getCurrentConversation: () => Conversation | null;

  // Folder tree from disk
  chatTree: ChatTreeNode[];
  expandedFolders: Set<string>;

  // Model/agent selection
  model: string;
  agentId: string | null;
  isStreaming: boolean;

  // Estimated context-window budget for the most recent send (null until first send)
  contextBudget: ContextBudget | null;
  // True when the sliding window dropped older messages on the most recent send
  contextWindowTrimmed: boolean;

  // File context attached to conversation
  contextFiles: ContextFile[];

  // Ghost mode (incognito)
  isGhostMode: boolean;
  ghostConversation: Conversation | null;

  // Actions - basic conversation
  createConversation: (folderId?: string) => Promise<void>;
  createConversationInBackground: (options?: { folderId?: string; title?: string }) => Promise<Conversation>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setModel: (model: string) => void;
  setAgentId: (agentId: string | null) => void;
  sendMessage: (content: string) => Promise<void>;
  sendMessageToConversation: (
    conversationId: string,
    content: string,
    options?: { agentId?: string | null; model?: ModelId; allowAutoRename?: boolean; setStreaming?: boolean; guardrailsConfig?: GuardrailsConfig }
  ) => Promise<void>;

  // Actions - folder management
  loadChatsFromDisk: () => Promise<void>;
  createFolder: (name: string, parentFolderId?: string) => Promise<void>;
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  toggleFolderExpansion: (folderId: string) => void;
  toggleFolderPin: (folderId: string) => Promise<void>;

  // Actions - chat management
  renameChat: (chatId: string, newTitle: string) => Promise<void>;
  moveConversation: (chatId: string, targetFolderId: string | null) => Promise<void>;

  // Actions - context files
  addContextFiles: (paths: string[]) => Promise<void>;
  removeContextFile: (path: string) => void;
  clearContextFiles: () => void;

  // Actions - ghost mode
  startGhostSession: () => void;
  exitGhostSession: () => void;

  // Actions - tool execution
  confirmToolExecution: (toolCallId: string) => Promise<void>;
  rejectToolExecution: (toolCallId: string) => void;

  // Actions - tool state management
  markToolCallsStopped: (conversationId: string) => void;
}

function deriveConversationTitle(content: string, maxLength = 50): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

/** Merge incoming tool calls with existing ones, skipping duplicates by ID. */
function mergeToolCalls(existing: ToolCallState[], incoming: ToolCallState[]): ToolCallState[] {
  const existingIds = new Set(existing.map((tc) => tc.id));
  return [...existing, ...incoming.filter((tc) => !existingIds.has(tc.id))];
}

/** Update the last assistant message in a messages array with the given partial updates. */
function updateLastAssistantMessage(messages: Message[], updates: Partial<Message>): Message[] {
  const result = [...messages];
  const lastIdx = result.length - 1;
  if (lastIdx >= 0 && result[lastIdx].role === "assistant") {
    result[lastIdx] = { ...result[lastIdx], ...updates };
  }
  return result;
}

/** Serialize a Conversation's messages to ChatData message format for disk persistence. */
function serializeMessages(messages: Message[]): ChatData["messages"] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    ...(m.toolCalls?.length ? {
      toolCalls: m.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
        status: tc.status,
        result: tc.result,
        error: tc.error,
        durationMs: tc.durationMs,
      })),
    } : {}),
  }));
}

/** Build a ChatData object from a Conversation for disk persistence. */
function conversationToChatData(conv: Conversation, model: string, agentId: string | null): ChatData {
  return {
    id: conv.id,
    title: conv.title,
    model,
    agentId,
    messages: serializeMessages(conv.messages),
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  };
}

export const useChatStore = create<ChatState>((set, get) => {
  /** Apply an update function to a conversation, handling ghost-vs-regular dispatch. */
  const applyUpdate = (conversationId: string, updateFn: (c: Conversation) => Conversation) => {
    const { isGhostMode, ghostConversation } = get();
    const isGhost = isGhostMode && ghostConversation?.id === conversationId;
    if (isGhost) {
      set((s) => s.ghostConversation ? { ghostConversation: updateFn(s.ghostConversation) } : s);
    } else {
      set((s) => ({ conversations: s.conversations.map((c) => c.id === conversationId ? updateFn(c) : c) }));
    }
  };

  const createConversationInternal = async (options: {
    folderId?: string;
    title?: string;
    select?: boolean;
    background?: boolean;
  }): Promise<Conversation> => {
    const id = uuid();
    const dir = await getAppDataDir();

    let folderPath: string | undefined;
    if (options.folderId) {
      const folder = findNodeInTree(get().chatTree, options.folderId);
      if (folder && folder.type === "folder") {
        folderPath = folder.path;
      }
    }

    const now = new Date();
    const title = options.title?.trim() || "New Chat";
    const path = folderPath ? `${folderPath}/${id}.json` : `${dir}/chats/${id}.json`;
    const newConversation: Conversation = {
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
      path,
      folderId: options.folderId,
      background: options.background,
    };

    set((state) => ({
      conversations: options.select ? [newConversation, ...state.conversations] : [...state.conversations, newConversation],
      currentConversationId: options.select ? id : state.currentConversationId,
    }));

    // Skip disk save for background conversations (e.g. scheduler runs)
    if (isTauri() && !options.background) {
      try {
        const chatData: ChatData = {
          id: newConversation.id,
          title: newConversation.title,
          model: get().model,
          agentId: get().agentId,
          messages: [],
          createdAt: newConversation.createdAt.toISOString(),
          updatedAt: newConversation.updatedAt.toISOString(),
        };
        await saveChatToFolder(chatData, folderPath);
        await get().loadChatsFromDisk();
      } catch (error) {
        console.error("[chat-store] Failed to save chat to disk:", error);
      }
    }

    return newConversation;
  };

  const streamMessage = async (params: {
    conversationId: string;
    content: string;
    isGhost: boolean;
    allowAutoRename: boolean;
    setStreaming: boolean;
    agentIdOverride?: string | null;
    modelOverride?: ModelId;
    guardrailsConfigOverride?: GuardrailsConfig;
  }) => {
    const { conversationId, content, isGhost, allowAutoRename, setStreaming, agentIdOverride, modelOverride, guardrailsConfigOverride } = params;
    const state = get();
    const existingConversation = isGhost
      ? state.ghostConversation
      : state.conversations.find((c) => c.id === conversationId);
    if (!existingConversation) return;

    const isFirstUserMessage = (existingConversation.messages.length ?? 0) === 0;
    const currentTitle = existingConversation.title?.trim() ?? "";
    const autoTitle = allowAutoRename ? deriveConversationTitle(content) : null;
    const shouldAutoRename =
      allowAutoRename &&
      isFirstUserMessage &&
      !isGhost &&
      !!autoTitle &&
      (currentTitle === "" || currentTitle === "New Chat" || currentTitle === "Untitled");

    const userMessage: Message = {
      id: uuid(),
      role: "user",
      content,
      createdAt: new Date(),
    };

    const updateConversation = (updater: (conv: Conversation) => Conversation) => {
      if (isGhost) {
        set((state) => {
          if (!state.ghostConversation) return state;
          return { ghostConversation: updater(state.ghostConversation) };
        });
      } else {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? updater(c) : c
          ),
        }));
      }
    };

    // Log user input (truncate for privacy/size)
    const messagePreview = content.length > 100 ? `${content.slice(0, 100)}...` : content;
    logAgent("USER_INPUT", `Message received: ${messagePreview}`, { conversationId, isGhost });

    updateConversation((c) => ({
      ...c,
      messages: [...c.messages, userMessage],
      title: shouldAutoRename ? (autoTitle ?? c.title) : c.title,
      updatedAt: new Date(),
    }));

    if (shouldAutoRename) {
      await get().renameChat(conversationId, autoTitle!);
    }

    if (setStreaming) {
      set({ isStreaming: true });
    }

    try {
      const settings = useSettingsStore.getState();
      const agentId = agentIdOverride ?? get().agentId;
      const agents = useAgentStore.getState().agents;
      const agent = agents.find((a) => a.name === agentId);

      const conversation = isGhost
        ? get().ghostConversation
        : get().conversations.find((c) => c.id === conversationId);
      if (!conversation) return;

      const assistantMessage: Message = {
        id: uuid(),
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };

      updateConversation((c) => ({
        ...c,
        messages: [...c.messages, assistantMessage],
        updatedAt: new Date(),
      }));

      const model = (modelOverride ?? get().model) as ChatModelId;
      const isLocal = model === "local";
      const baseSystemPrompt = agent?.systemPrompt ?? "You are a helpful AI assistant.";
      const temperature = agent?.temperature ?? 0.7;
      // Per-agent tool scoping: when the agent declares a `tools:` list, only
      // those tools are exposed for this run.
      const allowedTools = agent?.tools;

      let systemPrompt = baseSystemPrompt;

      // Load persistent memories. Canonical store is the app-data memories dir
      // (Toolbox "memories"); SOUL/USER and any `alwaysInclude` memory are
      // injected, bounded in size, with a legacy read of settingsDir/memories/.
      const memories = await resolveMemories({ settingsDir: settings.settingsDirectory });
      for (const mem of memories) {
        systemPrompt += `\n\n## ${mem.heading}\n${mem.body}`;
      }

      // Inject skill index (always) + matched skill bodies (by trigger).
      try {
        const resolvedSkills = await resolveSkills(content);
        systemPrompt += renderSkillsForPrompt(resolvedSkills);
      } catch (error) {
        console.warn("[chat-store] Failed to resolve skills:", error);
      }

      // Toolbox awareness: compact inventory of every category so the agent
      // knows what exists without a list_toolbox_items round-trip. Always
      // injected (read-only), independent of allowSelfEnhancement.
      try {
        systemPrompt += await buildToolboxInventory();
      } catch (error) {
        console.warn("[chat-store] Failed to build toolbox inventory:", error);
      }

      // Inject current agent context
      if (agent) {
        systemPrompt += `\n\n## Current Agent\nName: ${agent.name}${agent.model ? `\nModel: ${agent.model}` : ""}\nTemperature: ${agent.temperature}`;
      }

      // Inject file context into system prompt
      const contextFiles = get().contextFiles;
      if (contextFiles.length > 0) {
        const fileContext = contextFiles
          .map((f) => `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``)
          .join("\n\n");
        systemPrompt += `\n\n## File Context\nThe user has attached the following files for reference:\n\n${fileContext}`;
      }

      // Inject Working Directory context
      if (settings.workingDirectory) {
        systemPrompt += `\n\n## Working Directory\nThe user's current working directory is: ${settings.workingDirectory}\n- Relative paths in file tools (read_file, write_file, etc.) automatically resolve to this directory.\n- Paths starting with agents/, prompts/, memories/, skills/, workflows/ automatically resolve to the Verbalis data directory.`;
      }

      // Memory / self-enhancement guidance
      systemPrompt += `\n\n## Memory\nUse the \`remember\` tool to persist durable facts about the user or task so they are available in future sessions. Don't remember trivial or ephemeral details.`;
      if (settings.allowSelfEnhancement) {
        systemPrompt += `\n\n## Self-Enhancement\nYou may improve your own Toolbox using \`list_toolbox_items\`, \`read_toolbox_item\`, \`write_toolbox_item\`, \`edit_toolbox_item\`, and \`delete_toolbox_item\` (categories: prompts, memories, agents, skills, workflows). Writes and deletes require user confirmation. Prefer \`edit_toolbox_item\` for small changes and \`write_toolbox_item\` for new items or rewrites. Create referenced agents before workflows that name them.\n\n${renderToolboxFormatReference()}`;
      }
      if (settings.apiKeys.openrouter?.trim() && settings.imageModel) {
        systemPrompt += `\n\n## Image Generation\nWhen the user asks you to create, draw, or generate an image or picture, use the \`generate_image\` tool. To edit or vary a previously generated image, pass its file path (the "Saved to:" line of the earlier tool result) as \`source_image\`. Generated images are saved to ~/.verbalis/images and shown to the user automatically — after the tool succeeds, just briefly describe the image; never embed image data in your reply.`;
      }

      // Helper: run a model through the VerbalisAgentAdapter (Tauri only)
      // Shared by both local and cloud models for consistent tool execution,
      // guardrails, debug logging, and event flow.
      const runWithAdapter = async (
        adapterModel: Model<Api>,
        adapterApiKey: string,
        adapterIsLocal: boolean,
        adapterReasoning?: ThinkingLevel
      ) => {
        const loopStore = useAgenticLoopStore.getState();
        const guardrailsConfig = guardrailsConfigOverride ?? settings.guardrailsConfig;

        // Sliding-window aggressiveness: tightened on a context-overflow retry.
        let historyBudgetFactor = 1;

        // Get or create adapter for this conversation
        let adapter = loopStore.getAdapter(conversationId);
        if (adapter) {
          adapter.stop();
        }
        adapter = loopStore.createAdapter(conversationId, agentId);

        // Message provider - gets fresh messages each iteration, trimmed to the
        // context budget via a sliding window over message history.
        const messageProvider = () => {
          const conv = isGhost
            ? get().ghostConversation
            : get().conversations.find((c) => c.id === conversationId);
          const messages = conv?.messages ?? [];
          const trim = trimMessagesToBudget({
            messages,
            systemPrompt,
            tools: getToolsForContext(allowedTools),
            contextWindow: adapterModel.contextWindow,
            maxTokens: adapterModel.maxTokens,
            historyBudgetFactor,
          });
          if (trim.trimmed) {
            set({ contextWindowTrimmed: true });
            logAgent("CONTEXT", "Sliding window dropped older messages", {
              droppedCount: trim.droppedCount,
              kept: trim.messages.length,
            });
          }
          return trim.messages;
        };
        adapter.setMessageProvider(messageProvider);

        // Helper to sync tool call state to conversation
        // Searches ALL messages (not just last) to find the tool call by ID
        const syncToolCallToConversation = (toolCall: ToolCallState) => {
          updateConversation((c) => {
            let found = false;
            const messages = c.messages.map((m) => {
              if (!m.toolCalls) return m;
              const tcIndex = m.toolCalls.findIndex((tc) => tc.id === toolCall.id);
              if (tcIndex === -1) return m;
              found = true;
              const updatedToolCalls = [...m.toolCalls];
              updatedToolCalls[tcIndex] = toolCall;
              return { ...m, toolCalls: updatedToolCalls };
            });
            if (!found) {
              // Tool call not in any message yet — append to last assistant message
              const lastIdx = messages.length - 1;
              if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
                const existingIds = new Set((messages[lastIdx].toolCalls ?? []).map(tc => tc.id));
                if (!existingIds.has(toolCall.id)) {
                  messages[lastIdx] = {
                    ...messages[lastIdx],
                    toolCalls: [...(messages[lastIdx].toolCalls ?? []), toolCall],
                  };
                }
              }
            }
            return { ...c, messages, updatedAt: new Date() };
          });
        };

        // Context-overflow retry bookkeeping (see run block below).
        let retriedContextExceeded = false;
        let pendingContextRetry = false;

        // Event handler for UI sync (reused across a context-overflow retry).
        const onAdapterEvent = (event: AgentLoopEvent) => {
          switch (event.type) {
            case "assistant_message_started": {
              updateConversation((c) => {
                const messages = [...c.messages];
                const lastMsg = messages[messages.length - 1];

                // If last message has content and tool calls, this is a follow-up turn
                if (lastMsg?.role === "assistant" && (lastMsg.content.trim() !== "" || (lastMsg.toolCalls && lastMsg.toolCalls.length > 0))) {
                  const newAssistantMessage: Message = {
                    id: event.messageId,
                    role: "assistant",
                    content: "",
                    createdAt: new Date(),
                  };
                  return { ...c, messages: [...messages, newAssistantMessage], updatedAt: new Date() };
                }
                return c; // First turn - use existing empty message
              });
              break;
            }
            case "text_delta":
              updateConversation((c) => ({
                ...c,
                messages: updateLastAssistantMessage(c.messages, { content: event.fullContent }),
                updatedAt: new Date(),
              }));
              break;
            case "thinking_completed":
              updateConversation((c) => {
                const messages = [...c.messages];
                const lastIdx = messages.length - 1;
                if (lastIdx < 0 || messages[lastIdx].role !== "assistant") {
                  return c;
                }
                messages[lastIdx] = {
                  ...messages[lastIdx],
                  content: event.content,
                  ...(event.toolCalls.length > 0 ? {
                    toolCalls: mergeToolCalls(messages[lastIdx].toolCalls ?? [], event.toolCalls),
                  } : {}),
                };
                return { ...c, messages, updatedAt: new Date() };
              });
              break;
            case "tool_pending":
            case "tool_executing":
            case "tool_completed":
            case "tool_failed":
            case "tool_cancelled":
              syncToolCallToConversation(event.toolCall);
              break;
            case "loop_error":
              // If the context overflowed and we can still retry with a
              // tighter window, suppress the error in the UI and let the retry
              // run; otherwise surface it.
              if (event.errorType === "context_exceeded" && !retriedContextExceeded) {
                pendingContextRetry = true;
                break;
              }
              updateConversation((c) => {
                const lastContent = c.messages[c.messages.length - 1]?.content || "";
                return {
                  ...c,
                  messages: updateLastAssistantMessage(c.messages, {
                    content: `${lastContent}\n\nError: ${event.error}`,
                  }),
                  updatedAt: new Date(),
                };
              });
              break;
          }
        };

        // Estimate the context-window budget for this send and surface it.
        // Trimming/summarization is layered on top of this in trim.ts.
        const budgetMessages = (isGhost
          ? get().ghostConversation?.messages
          : get().conversations.find((c) => c.id === conversationId)?.messages) ?? [];
        const budget = computeContextBudget({
          systemPrompt,
          tools: getToolsForContext(allowedTools),
          messages: budgetMessages,
          contextWindow: adapterModel.contextWindow,
          maxTokens: adapterModel.maxTokens,
        });
        set({ contextBudget: budget, contextWindowTrimmed: false });
        if (!budget.withinBudget) {
          logAgent("CONTEXT", "Estimated prompt exceeds context budget", {
            used: budget.used,
            available: budget.available,
            remaining: budget.remaining,
          });
        }

        // Build adapter config
        const adapterConfig: VerbalisAdapterConfig = {
          model: adapterModel,
          systemPrompt,
          apiKey: adapterApiKey,
          temperature,
          reasoning: adapterReasoning,
          isLocal: adapterIsLocal,
          guardrailsConfig,
          allowedTools,
          onEvent: () => {}, // Events already handled via onEvent subscription
        };

        // Run the adapter, subscribing the (reusable) event handler each attempt.
        const runOnce = async () => {
          const unsub = adapter!.onEvent(onAdapterEvent);
          loopStore.setCurrentLoop(conversationId);
          try {
            await adapter!.run(adapterConfig);
          } finally {
            unsub();
          }
        };

        await runOnce();

        // If the context overflowed, retry once with a tighter sliding window
        // and a fresh adapter (run() can't be re-entered after it finishes).
        if (pendingContextRetry && !retriedContextExceeded) {
          retriedContextExceeded = true;
          pendingContextRetry = false;
          historyBudgetFactor = 0.5;
          logAgent("CONTEXT", "Context exceeded — retrying with a tighter window");
          adapter = loopStore.createAdapter(conversationId, agentId);
          adapter.setMessageProvider(messageProvider);
          await runOnce();
        }
      };

      if (isLocal) {
        const localSettings = settings.localLLM;
        if (!localSettings.enabled) {
          updateConversation((c) => ({
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: "Local LLM is disabled. Enable it in Settings to use a local model.",
            }),
            updatedAt: new Date(),
          }));
          return;
        }

        const resolvedModel = await resolveLocalModel(
          localSettings.provider,
          localSettings.baseUrl,
          localSettings.model
        );
        if (!resolvedModel) {
          updateConversation((c) => ({
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: "No local model found. Configure a model name or check your local server.",
            }),
            updatedAt: new Date(),
          }));
          return;
        }

        const localModel = buildLocalModel({
          provider: localSettings.provider,
          baseUrl: localSettings.baseUrl,
          model: resolvedModel,
        });

        if (isTauri()) {
          // Route through adapter for full tool execution, guardrails, and logging
          await runWithAdapter(localModel, "local", true);
        } else {
          // Web-only fallback: simple streaming, no tools available
          const context = buildContextFromConversation({
            conversation,
            systemPrompt,
            api: localModel.api,
            provider: localModel.provider,
            model: localModel.id,
          });

          const stream = streamSimple(localModel, context, {
            apiKey: "local",
            temperature,
          });

          let fullContent = "";
          for await (const event of stream) {
            if (event.type === "text_delta") {
              fullContent += event.delta;
              const displayContent = stripProtocolMarkers(fullContent);
              updateConversation((c) => ({
                ...c,
                messages: updateLastAssistantMessage(c.messages, { content: displayContent }),
                updatedAt: new Date(),
              }));
            } else if (event.type === "error") {
              throw new Error(event.error.errorMessage || "Local LLM error");
            }
          }
        }
      } else {
        const resolved = resolveModelObject(model, settings.apiKeys, settings.selectedModels);
        if (!resolved) {
          const active = getActiveModels(settings.selectedModels);
          const entry = active.find((m) => m.id === model);
          const providerName = entry?.provider ?? "the appropriate";
          updateConversation((c) => ({
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: entry
                ? `Please configure a ${providerName} API key in Settings to use the chat.`
                : model
                  ? `Unknown model: ${model}. Please select a valid model in Settings.`
                  : "No model selected. Choose one under Settings → Models.",
            }),
            updatedAt: new Date(),
          }));
          return;
        }

        const { modelObj, apiKey, capability } = resolved;

        // Reasoning effort: per-model preference, falling back to OpenRouter's
        // own default and clamped to what it says the model accepts. Resolved
        // from the same capability the picker reads, so the two cannot disagree
        // — and no capability means no picker, hence nothing to send. "off"
        // becomes undefined; never forward it to the SDK.
        const reasoning = capability
          ? toReasoningOption(resolveEffortFor(capability, settings.modelEffort?.[model]))
          : undefined;

        // Use VerbalisAgentAdapter for tool handling in desktop environment
        if (isTauri()) {
          await runWithAdapter(modelObj, apiKey, false, reasoning);
        } else {
          // Web-only mode: simple streaming without tool support
          const stream = streamSimple(modelObj, buildContextFromConversation({
            conversation,
            systemPrompt,
            api: modelObj.api,
            provider: modelObj.provider,
            model: modelObj.id,
            includeTools: false,
          }), {
            apiKey,
            temperature,
            reasoning,
          });

          let fullContent = "";
          for await (const event of stream) {
            if (event.type === "text_delta") {
              fullContent += event.delta;
              updateConversation((c) => ({
                ...c,
                messages: updateLastAssistantMessage(c.messages, {
                  content: stripProtocolMarkers(fullContent),
                }),
                updatedAt: new Date(),
              }));
            } else if (event.type === "error") {
              throw new Error(event.error.errorMessage || "Failed to send message");
            }
          }
        }
      }

      if (!isGhost) {
        const finalConversation = get().conversations.find((c) => c.id === conversationId);
        if (finalConversation?.path && !finalConversation.background) {
          const chatData = conversationToChatData(finalConversation, model, agentId);
          const folderPath = finalConversation.path.substring(0, finalConversation.path.lastIndexOf("/"));
          const dir = await getAppDataDir();
          await saveChatToFolder(chatData, folderPath === `${dir}/chats` ? undefined : folderPath);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      updateConversation((c) => {
        if (c.messages[c.messages.length - 1]?.role === "assistant") {
          return {
            ...c,
            messages: updateLastAssistantMessage(c.messages, {
              content: `Error: ${error instanceof Error ? error.message : "Failed to send message"}`,
            }),
            updatedAt: new Date(),
          };
        }
        return { ...c, updatedAt: new Date() };
      });
    } finally {
      if (setStreaming) {
        set({ isStreaming: false });
      }
    }
  };

  return {
    conversations: [],
    currentConversationId: null,
    getCurrentConversation: () => {
      const state = get();
      if (state.isGhostMode && state.ghostConversation?.id === state.currentConversationId) {
        return state.ghostConversation;
      }
      return state.conversations.find((c) => c.id === state.currentConversationId) ?? null;
    },
    chatTree: [],
    expandedFolders: new Set<string>(),
    model: useSettingsStore.getState().defaultModel,
    agentId: null,
    isStreaming: false,
    contextBudget: null,
    contextWindowTrimmed: false,
    contextFiles: [],
    isGhostMode: false,
    ghostConversation: null,
    createConversation: async (folderId?: string) => {
    set({ contextFiles: [] });
    await createConversationInternal({ folderId, select: true });
  },

  createConversationInBackground: async (options) => {
    return createConversationInternal({
      folderId: options?.folderId,
      title: options?.title,
      select: false,
      background: true,
    });
  },

  selectConversation: async (id) => {
    // Check if it's the ghost conversation
    const { ghostConversation, isGhostMode } = get();
    if (isGhostMode && ghostConversation?.id === id) {
      set({ currentConversationId: id, contextFiles: [] });
      return;
    }

    const conversation = get().conversations.find((c) => c.id === id) ?? null;
    set({
      currentConversationId: id,
      contextFiles: [],
      ...(isGhostMode && { isGhostMode: false, ghostConversation: null }),
    });

    if (!conversation?.path) return;
    if (conversation.messages.length > 0) return;

    const loaded = await loadChatByPath(conversation.path);
    if (!loaded) return;

    // Auto-migrate old .yaml chats to .json
    const isLegacyYaml = conversation.path.endsWith(".yaml");
    let newPath = conversation.path;
    if (isLegacyYaml && isTauri()) {
      try {
        const dir = conversation.path.substring(0, conversation.path.lastIndexOf("/"));
        newPath = `${dir}/${loaded.id}.json`;
        await saveChatToFolder(loaded, dir === `${await getAppDataDir()}/chats` ? undefined : dir);
        await deletePath(conversation.path);
      } catch (e) {
        console.error("[chat-store] Failed to auto-migrate YAML chat:", e);
        newPath = conversation.path; // fallback to original path
      }
    }

    set((state) => {
      const conversations = state.conversations.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          title: loaded.title || c.title,
          path: newPath,
          messages: loaded.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: stripProtocolMarkers(m.content),
            createdAt: new Date(m.createdAt),
            ...(m.toolCalls?.length ? {
              toolCalls: m.toolCalls.map((tc) => {
                const normalizedStatus = normalizeToolCallStatus(tc.status);
                const wasInFlight =
                  normalizedStatus === "pending" ||
                  normalizedStatus === "pending_confirmation" ||
                  normalizedStatus === "executing";
                return {
                  ...tc,
                  status: wasInFlight ? "error" as ToolCallStatus : normalizedStatus,
                  error: wasInFlight
                    ? (tc.error || "Interrupted — app closed during execution")
                    : tc.error,
                };
              }),
            } : {}),
          })),
          createdAt: new Date(loaded.createdAt),
          updatedAt: new Date(loaded.updatedAt),
        };
      });
      return { conversations };
    });

    // Refresh tree if we migrated
    if (isLegacyYaml && isTauri()) {
      await get().loadChatsFromDisk();
    }
  },

  deleteConversation: async (id) => {
    const conversation = get().conversations.find((c) => c.id === id);

    // Update state first
    set((state) => {
      const newConversations = state.conversations.filter((c) => c.id !== id);
      const newCurrentId =
        state.currentConversationId === id
          ? newConversations[0]?.id ?? null
          : state.currentConversationId;
      return {
        conversations: newConversations,
        currentConversationId: newCurrentId,
      };
    });

    // Delete from disk if Tauri is available
    if (isTauri() && conversation?.path) {
      try {
        await deleteChatByPath(conversation.path);
        await get().loadChatsFromDisk();
      } catch (error) {
        console.error("Failed to delete chat from disk:", error);
      }
    }
  },

  setModel: (model) => set({ model }),
  setAgentId: (agentId) => {
    set({ agentId });
    // Persist selection so it survives restart.
    useSettingsStore.getState().setSelectedAgentId(agentId);
  },

  sendMessage: async (content) => {
    const state = get();
    const { isGhostMode } = state;

    // Create conversation if none exists
    if (!state.currentConversationId && !isGhostMode) {
      await get().createConversation();
    } else if (isGhostMode && !state.ghostConversation) {
      // Create ghost conversation in memory
      const ghostConv: Conversation = {
        id: uuid(),
        title: "Incognito Session",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      set({
        ghostConversation: ghostConv,
        currentConversationId: ghostConv.id,
      });
    }

    const conversationId = get().currentConversationId!;
    const isGhost = get().isGhostMode;

    await streamMessage({
      conversationId,
      content,
      isGhost,
      allowAutoRename: true,
      setStreaming: true,
    });
  },

  sendMessageToConversation: async (conversationId, content, options) => {
    await streamMessage({
      conversationId,
      content,
      isGhost: false,
      allowAutoRename: options?.allowAutoRename ?? false,
      setStreaming: options?.setStreaming ?? false,
      agentIdOverride: options?.agentId,
      modelOverride: options?.model,
      guardrailsConfigOverride: options?.guardrailsConfig,
    });
  },

  // Folder management
  loadChatsFromDisk: async () => {
    try {
      const tree = await loadChatTree();
      set({ chatTree: tree });

      // Also sync conversations in memory from the tree
      const existingById = new Map(get().conversations.map((c) => [c.id, c]));
      const conversations: Conversation[] = [];
      const loadFromTree = (nodes: ChatTreeNode[]) => {
        for (const node of nodes) {
          if (node.type === "chat") {
            const existing = existingById.get(node.id);
            conversations.push({
              id: node.id,
              title: node.title || "Untitled",
              messages: existing?.messages ?? [], // Preserve in-memory messages
              createdAt: existing?.createdAt ?? new Date(),
              updatedAt: existing?.updatedAt ?? (node.updatedAt ? new Date(node.updatedAt) : new Date()),
              path: node.path,
              folderId: existing?.folderId,
            });
          } else if (node.children) {
            loadFromTree(node.children);
          }
        }
      };
      loadFromTree(tree);

      const conversationIds = new Set(conversations.map((c) => c.id));
      const inMemoryOnly = get().conversations.filter((c) => !conversationIds.has(c.id));
      const mergedConversations = [...conversations, ...inMemoryOnly];

      set({ conversations: mergedConversations });
    } catch (error) {
      console.error("[chat-store] Failed to load chats from disk:", error);
    }
  },

  createFolder: async (name: string, parentFolderId?: string) => {
    try {
      const existingNames = getSiblingFolderNames(get().chatTree, parentFolderId);
      const uniqueName = getUniqueName(name, existingNames);
      let parentPath: string | undefined;
      if (parentFolderId) {
        const folder = findNodeInTree(get().chatTree, parentFolderId);
        if (folder && folder.type === "folder") {
          parentPath = folder.path;
        }
      }
      await createChatFolder(uniqueName, parentPath);
      await get().loadChatsFromDisk();
    } catch (error) {
      console.error("[chat-store] Failed to create folder:", error);
    }
  },

  renameFolder: async (folderId: string, newName: string) => {
    try {
      const folder = findNodeInTree(get().chatTree, folderId);
      if (folder && folder.type === "folder") {
        await renameChatFolder(folder.path, newName);
        await get().loadChatsFromDisk();
      }
    } catch (error) {
      console.error("Failed to rename folder:", error);
    }
  },

  deleteFolder: async (folderId: string) => {
    try {
      const folder = findNodeInTree(get().chatTree, folderId);
      if (folder && folder.type === "folder") {
        await deleteChatFolder(folder.path);
        await get().loadChatsFromDisk();
      }
    } catch (error) {
      console.error("Failed to delete folder:", error);
    }
  },

  toggleFolderExpansion: (folderId: string) => {
    set((state) => ({ expandedFolders: toggleInSet(state.expandedFolders, folderId) }));
  },

  toggleFolderPin: async (folderId: string) => {
    try {
      const folder = findNodeInTree(get().chatTree, folderId);
      if (folder && folder.type === "folder") {
        const meta = await loadFolderMeta(folder.path);
        const newMeta: ChatFolderMeta = {
          isPinned: !(meta?.isPinned ?? false),
          createdAt: meta?.createdAt || new Date().toISOString(),
        };
        await saveFolderMeta(folder.path, newMeta);
        await get().loadChatsFromDisk();
      }
    } catch (error) {
      console.error("Failed to toggle folder pin:", error);
    }
  },

  // Chat management
  renameChat: async (chatId: string, newTitle: string) => {
    // Update in memory first (always works)
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === chatId ? { ...c, title: newTitle, updatedAt: new Date() } : c
      ),
    }));

    // Save to disk if Tauri is available
    if (isTauri()) {
      try {
        const updated = get().conversations.find((c) => c.id === chatId);
        if (updated?.path) {
          const chatData = conversationToChatData(updated, get().model, get().agentId);
          const folderPath = updated.path.substring(0, updated.path.lastIndexOf("/"));
          const dir = await getAppDataDir();
          await saveChatToFolder(chatData, folderPath === `${dir}/chats` ? undefined : folderPath);
          await get().loadChatsFromDisk();
        }
      } catch (error) {
        console.error("Failed to rename chat:", error);
      }
    }
  },

  moveConversation: async (chatId: string, targetFolderId: string | null) => {
    try {
      const conversation = get().conversations.find((c) => c.id === chatId);
      if (!conversation?.path) return;

      let targetDir: string;
      if (targetFolderId === null) {
        targetDir = `${await getAppDataDir()}/chats`;
      } else {
        const folder = findNodeInTree(get().chatTree, targetFolderId);
        if (folder?.type !== "folder") return;
        targetDir = folder.path;
      }

      const fileName = conversation.path.substring(conversation.path.lastIndexOf("/") + 1);
      const newPath = `${targetDir}/${fileName}`;
      if (newPath === conversation.path) return;

      await renamePath(conversation.path, newPath);
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === chatId ? { ...c, path: newPath, folderId: targetFolderId ?? undefined } : c
        ),
      }));
      await get().loadChatsFromDisk();
    } catch (error) {
      console.error("Failed to move conversation:", error);
    }
  },

  // Context files
  addContextFiles: async (paths: string[]) => {
    const existing = new Set(get().contextFiles.map((f) => f.path));
    const newPaths = paths.filter((p) => !existing.has(p));
    if (newPaths.length === 0) return;

    const MAX_CONTENT_LENGTH = 50_000;
    const files: ContextFile[] = [];
    for (const filePath of newPaths) {
      try {
        let content = await readFile(filePath);
        if (content.length > MAX_CONTENT_LENGTH) {
          content = `${content.slice(0, MAX_CONTENT_LENGTH)}\n... (truncated)`;
        }
        const name = filePath.split("/").pop() ?? filePath;
        files.push({ path: filePath, name, content });
      } catch (error) {
        console.error(`[chat-store] Failed to read file: ${filePath}`, error);
      }
    }
    if (files.length > 0) {
      set((state) => ({ contextFiles: [...state.contextFiles, ...files] }));
    }
  },

  removeContextFile: (path: string) => {
    set((state) => ({ contextFiles: state.contextFiles.filter((f) => f.path !== path) }));
  },

  clearContextFiles: () => {
    set({ contextFiles: [] });
  },

  // Ghost mode
  startGhostSession: () => {
    set({
      isGhostMode: true,
      ghostConversation: null,
      currentConversationId: null,
    });
  },

  exitGhostSession: () => {
    set({
      isGhostMode: false,
      ghostConversation: null,
      currentConversationId: get().conversations[0]?.id ?? null,
    });
  },

  // Tool execution - delegates to loop engine
  confirmToolExecution: async (toolCallId: string) => {
    const conversationId = get().currentConversationId;
    if (!conversationId) return;

    // Delegate to the loop store - the loop engine will handle execution
    // and emit events that sync state back via our event handlers
    await useAgenticLoopStore.getState().confirmTool(conversationId, toolCallId);
  },

  rejectToolExecution: (toolCallId: string) => {
    const conversationId = get().currentConversationId;
    if (!conversationId) return;

    // Delegate to the loop store
    useAgenticLoopStore.getState().rejectTool(conversationId, toolCallId, "Rejected by user");

    // Immediately reflect rejection in chat history to avoid stale pending UI.
    applyUpdate(conversationId, (c) => {
      let changed = false;
      const messages = c.messages.map((m) => {
        if (!m.toolCalls) return m;
        const updatedToolCalls = m.toolCalls.map((tc) => {
          if (tc.id !== toolCallId) return tc;
          changed = true;
          return {
            ...tc,
            status: "cancelled" as const,
            error: "Rejected by user",
            completedAt: tc.completedAt ?? new Date(),
          };
        });
        return changed ? { ...m, toolCalls: updatedToolCalls } : m;
      });
      return changed ? { ...c, messages, updatedAt: new Date() } : c;
    });
  },

  markToolCallsStopped: (conversationId: string) => {
    applyUpdate(conversationId, (c) => {
      let changed = false;
      const messages = c.messages.map((m) => {
        if (!m.toolCalls) return m;
        const updatedToolCalls = m.toolCalls.map((tc) => {
          if (
            tc.status === "pending" ||
            tc.status === "pending_confirmation" ||
            tc.status === "executing"
          ) {
            changed = true;
            return { ...tc, status: "stopped" as const };
          }
          return tc;
        });
        return changed ? { ...m, toolCalls: updatedToolCalls } : m;
      });
      return changed ? { ...c, messages, updatedAt: new Date() } : c;
    });
  },
  };
});

// ============================================================================
// Tool State Sync from Agentic Loop
// ============================================================================

// Subscribe to tool state changes from the agentic loop store
// This ensures conversation state stays in sync when tools are executed
// outside of the streaming context (e.g., when user confirms a tool)
subscribeToToolEvents((conversationId, toolCall) => {
  const state = useChatStore.getState();

  // Determine if this is a ghost conversation or regular
  const isGhost = state.isGhostMode && state.ghostConversation?.id === conversationId;
  const conversation = isGhost
    ? state.ghostConversation
    : state.conversations.find((c) => c.id === conversationId);

  if (!conversation) return;

  // Find the message with this tool call and update it
  const updateFn = (c: Conversation): Conversation => {
    let found = false;
    const messages = c.messages.map((m) => {
      if (!m.toolCalls) return m;

      const tcIndex = m.toolCalls.findIndex((tc) => tc.id === toolCall.id);
      if (tcIndex === -1) return m;

      found = true;
      // Update the tool call state
      const updatedToolCalls = [...m.toolCalls];
      updatedToolCalls[tcIndex] = {
        ...updatedToolCalls[tcIndex],
        status: normalizeToolCallStatus(toolCall.status),
        result: toolCall.result ?? updatedToolCalls[tcIndex].result,
        error: toolCall.error ?? updatedToolCalls[tcIndex].error,
        startedAt: toolCall.startedAt ?? updatedToolCalls[tcIndex].startedAt,
        completedAt: toolCall.completedAt ?? updatedToolCalls[tcIndex].completedAt,
        durationMs: toolCall.durationMs ?? updatedToolCalls[tcIndex].durationMs,
        undoAvailable: toolCall.undoAvailable ?? updatedToolCalls[tcIndex].undoAvailable,
        guardrailReason: toolCall.guardrailReason ?? updatedToolCalls[tcIndex].guardrailReason,
        guardrailViolations: toolCall.guardrailViolations ?? updatedToolCalls[tcIndex].guardrailViolations,
      };

      return { ...m, toolCalls: updatedToolCalls };
    });
    if (!found) {
      // Tool call not in any message yet — append to last assistant message
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
        const existingIds = new Set((messages[lastIdx].toolCalls ?? []).map(tc => tc.id));
        if (!existingIds.has(toolCall.id)) {
          messages[lastIdx] = {
            ...messages[lastIdx],
            toolCalls: [...(messages[lastIdx].toolCalls ?? []), toolCall],
          };
        }
      }
    }
    return { ...c, messages, updatedAt: new Date() };
  };

  if (isGhost) {
    useChatStore.setState((state) => {
      if (!state.ghostConversation) return state;
      return { ghostConversation: updateFn(state.ghostConversation) };
    });
  } else {
    useChatStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? updateFn(c) : c
      ),
    }));
  }
});

// ============================================================================
// Settings → Chat Model Sync
// ============================================================================

// When selectedModels or defaultModel change in settings, ensure the chat model
// is still valid. If it was removed from the active list, fall back gracefully.
useSettingsStore.subscribe((state, prevState) => {
  if (state.selectedModels === prevState.selectedModels && state.defaultModel === prevState.defaultModel) return;
  const chatModel = useChatStore.getState().model;
  if (chatModel === "local") return; // local model handled separately
  const active = getActiveModels(state.selectedModels);
  if (!active.some((m) => m.id === chatModel)) {
    const fallback = active.some((m) => m.id === state.defaultModel)
      ? state.defaultModel
      : active[0]?.id ?? "";
    useChatStore.setState({ model: fallback });
  }
});
