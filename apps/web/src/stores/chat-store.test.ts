import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks – vi.hoisted runs before vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockLoadChatTree,
  mockSaveChatToFolder,
  mockDeleteChatByPath,
  mockDeleteChatFolder,
  mockRenameChatFolder,
  mockCreateChatFolder,
  mockSaveFolderMeta,
  mockLoadFolderMeta,
  mockDeletePath,
  mockLoadChatByPath,
  mockReadFile,
  mockRenamePath,
  mockIsTauri,
  mockGetAppDataDir,
  mockGetToolsForContext,
  mockNormalizeToolCallStatus,
  mockStreamSimple,
  mockGetModel,
  mockGetActiveModels,
  mockSettingsGetState,
  mockConfirmTool,
  mockRejectTool,
  mockSetCurrentLoop,
  mockGetAdapter,
  mockCreateAdapter,
  mockUuidState,
} = vi.hoisted(() => ({
  mockLoadChatTree: vi.fn().mockResolvedValue([]),
  mockSaveChatToFolder: vi.fn().mockResolvedValue(undefined),
  mockDeleteChatByPath: vi.fn().mockResolvedValue(undefined),
  mockDeleteChatFolder: vi.fn().mockResolvedValue(undefined),
  mockRenameChatFolder: vi.fn().mockResolvedValue(undefined),
  mockCreateChatFolder: vi.fn().mockResolvedValue("/mock-data/chats/folder"),
  mockSaveFolderMeta: vi.fn().mockResolvedValue(undefined),
  mockLoadFolderMeta: vi.fn().mockResolvedValue(null),
  mockDeletePath: vi.fn().mockResolvedValue(undefined),
  mockLoadChatByPath: vi.fn().mockResolvedValue(null),
  mockReadFile: vi.fn().mockResolvedValue("file contents"),
  mockRenamePath: vi.fn().mockResolvedValue(undefined),
  mockIsTauri: vi.fn(() => false),
  mockGetAppDataDir: vi.fn().mockResolvedValue("/mock-data"),
  mockGetToolsForContext: vi.fn().mockReturnValue([]),
  mockNormalizeToolCallStatus: vi.fn((status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "failed":
        return "error";
      case "awaiting_approval":
        return "pending_confirmation";
      default:
        return status;
    }
  }),
  mockStreamSimple: vi.fn(),
  mockGetModel: vi.fn().mockReturnValue(null),
  mockGetActiveModels: vi.fn().mockReturnValue([]),
  mockSettingsGetState: vi.fn((): Record<string, unknown> => ({
    apiKeys: { anthropic: "", openai: "", google: "", openrouter: "" },
    localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
    guardrailsConfig: {},
    selectedModels: [],
    defaultModel: "claude-sonnet-4-20250514",
    imageModel: "",
    setSelectedAgentId: vi.fn(),
  })),
  mockConfirmTool: vi.fn(),
  mockRejectTool: vi.fn(),
  mockSetCurrentLoop: vi.fn(),
  mockGetAdapter: vi.fn().mockReturnValue(null),
  mockCreateAdapter: vi.fn(),
  mockUuidState: { counter: 0 },
}));

// ---------------------------------------------------------------------------
// Mocks – must come before importing the store
// ---------------------------------------------------------------------------

vi.mock("uuid", () => ({
  v4: vi.fn(() => {
    mockUuidState.counter += 1;
    return `mock-uuid-${mockUuidState.counter}`;
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@/lib/storage", () => ({
  getAppDataDir: mockGetAppDataDir,
  loadChatTree: mockLoadChatTree,
  saveChatToFolder: mockSaveChatToFolder,
  deleteChatByPath: mockDeleteChatByPath,
  deleteChatFolder: mockDeleteChatFolder,
  renameChatFolder: mockRenameChatFolder,
  createChatFolder: mockCreateChatFolder,
  saveFolderMeta: mockSaveFolderMeta,
  loadFolderMeta: mockLoadFolderMeta,
  deletePath: mockDeletePath,
  loadChatByPath: mockLoadChatByPath,
  readFile: mockReadFile,
  renamePath: mockRenamePath,
  isTauri: mockIsTauri,
}));

vi.mock("@/lib/logger", () => ({
  logAgent: vi.fn(),
}));

vi.mock("@/lib/tools", () => ({
  getToolsForContext: mockGetToolsForContext,
  normalizeToolCallStatus: mockNormalizeToolCallStatus,
}));

vi.mock("@/lib/protocol-parser", () => ({
  stripProtocolMarkers: vi.fn((s: string) => s),
}));

vi.mock("@/lib/message-conversion", () => ({
  messagesToPiMessages: vi.fn().mockReturnValue([]),
}));

vi.mock("@earendil-works/pi-ai", () => ({
  streamSimple: mockStreamSimple,
  getModel: mockGetModel,
  // Used by lib/reasoning to gate reasoning effort. The mocked model objects
  // here have no `reasoning` flag, so effort resolves to "off" throughout.
  getSupportedThinkingLevels: (model: { reasoning?: boolean }) =>
    model?.reasoning ? ["off", "low", "medium", "high"] : ["off"],
  clampThinkingLevel: (_model: unknown, level: string) => level,
  // Needed by web-tools param schemas (pulled in via toolbox-schemas → categories).
  StringEnum: (values: readonly string[], options?: Record<string, unknown>) => ({
    ...options,
    type: "string",
    enum: [...values],
  }),
}));

vi.mock("@/lib/http", () => ({
  appFetch: vi.fn(),
}));

vi.mock("@/lib/models", () => ({
  DEFAULT_MODEL_ID: "claude-sonnet-4-20250514",
  getActiveModels: mockGetActiveModels,
  // Only consulted when pi-ai's registry misses; openrouter is here so the
  // hand-built fallback model in resolveModelObject can be exercised.
  PROVIDER_API_MAP: { openrouter: "openai-completions" },
  PROVIDER_BASE_URL_MAP: { openrouter: "https://openrouter.ai/api/v1" },
}));

vi.mock("./settings-store", () => ({
  useSettingsStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: mockSettingsGetState,
      subscribe: vi.fn(() => vi.fn()),
      setState: vi.fn(),
      getInitialState: vi.fn(),
    },
  ),
}));

vi.mock("./agent-store", () => ({
  useAgentStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({ agents: [] })),
  }),
}));

vi.mock("./agentic-loop-store", () => ({
  useAgenticLoopStore: Object.assign(vi.fn(() => ({})), {
    getState: vi.fn(() => ({
      getAdapter: mockGetAdapter,
      createAdapter: mockCreateAdapter,
      setCurrentLoop: mockSetCurrentLoop,
      confirmTool: mockConfirmTool,
      rejectTool: mockRejectTool,
      stopLoop: vi.fn(),
    })),
  }),
  subscribeToToolEvents: vi.fn(),
}));

// Now import the store
import { useChatStore, type Message, type Conversation } from "./chat-store";
import type { ChatTreeNode } from "@/lib/storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    role: "user",
    content: "Hello",
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    title: "Test Chat",
    messages: [],
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeChatTreeNode(overrides: Partial<ChatTreeNode> = {}): ChatTreeNode {
  return {
    type: "chat",
    id: "chat-1",
    name: "Chat 1",
    path: "/mock-data/chats/chat-1.json",
    isPinned: false,
    ...overrides,
  };
}

function makeFolderTreeNode(overrides: Partial<ChatTreeNode> = {}): ChatTreeNode {
  return {
    type: "folder",
    id: "folder-1",
    name: "Folder 1",
    path: "/mock-data/chats/folder-1",
    isPinned: false,
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("chat-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUuidState.counter = 0;
    // Reset store state to initial
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      chatTree: [],
      expandedFolders: new Set(),
      model: "claude-sonnet-4-20250514",
      agentId: null,
      isStreaming: false,
      contextFiles: [],
      isGhostMode: false,
      ghostConversation: null,
    });
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------
  describe("initial state", () => {
    it("starts with empty conversations", () => {
      const state = useChatStore.getState();
      expect(state.conversations).toEqual([]);
      expect(state.currentConversationId).toBeNull();
    });

    it("starts with no streaming", () => {
      expect(useChatStore.getState().isStreaming).toBe(false);
    });

    it("starts with ghost mode off", () => {
      const s = useChatStore.getState();
      expect(s.isGhostMode).toBe(false);
      expect(s.ghostConversation).toBeNull();
    });

    it("starts with empty context files", () => {
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });

    it("starts with default model", () => {
      expect(useChatStore.getState().model).toBe("claude-sonnet-4-20250514");
    });

    it("starts with null agentId", () => {
      expect(useChatStore.getState().agentId).toBeNull();
    });

    it("starts with empty chatTree", () => {
      expect(useChatStore.getState().chatTree).toEqual([]);
    });

    it("starts with empty expandedFolders", () => {
      expect(useChatStore.getState().expandedFolders.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentConversation
  // -----------------------------------------------------------------------
  describe("getCurrentConversation", () => {
    it("returns null when no conversation is selected", () => {
      expect(useChatStore.getState().getCurrentConversation()).toBeNull();
    });

    it("returns the selected conversation", () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });
      expect(useChatStore.getState().getCurrentConversation()).toEqual(conv);
    });

    it("returns ghost conversation when in ghost mode", () => {
      const ghost = makeConversation({ id: "ghost-1", title: "Ghost" });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
        currentConversationId: "ghost-1",
      });
      expect(useChatStore.getState().getCurrentConversation()).toEqual(ghost);
    });

    it("returns regular conversation when ghost mode on but different id", () => {
      const conv = makeConversation({ id: "c1" });
      const ghost = makeConversation({ id: "ghost-1" });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
        currentConversationId: "c1",
        conversations: [conv],
      });
      expect(useChatStore.getState().getCurrentConversation()).toEqual(conv);
    });

    it("returns null when currentConversationId does not match any conversation", () => {
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "nonexistent",
      });
      expect(useChatStore.getState().getCurrentConversation()).toBeNull();
    });

    it("returns null when ghost mode is on but no ghost conversation exists and id is set", () => {
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: null,
        currentConversationId: "ghost-1",
        conversations: [],
      });
      expect(useChatStore.getState().getCurrentConversation()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // setModel / setAgentId
  // -----------------------------------------------------------------------
  describe("setModel / setAgentId", () => {
    it("updates the model", () => {
      useChatStore.getState().setModel("gpt-4o");
      expect(useChatStore.getState().model).toBe("gpt-4o");
    });

    it("updates the agentId", () => {
      useChatStore.getState().setAgentId("agent-1");
      expect(useChatStore.getState().agentId).toBe("agent-1");
    });

    it("sets agentId to null", () => {
      useChatStore.getState().setAgentId("agent-1");
      useChatStore.getState().setAgentId(null);
      expect(useChatStore.getState().agentId).toBeNull();
    });

    it("can set model multiple times", () => {
      useChatStore.getState().setModel("gpt-4o");
      useChatStore.getState().setModel("claude-opus-4-20250514");
      expect(useChatStore.getState().model).toBe("claude-opus-4-20250514");
    });
  });

  // -----------------------------------------------------------------------
  // createConversation
  // -----------------------------------------------------------------------
  describe("createConversation", () => {
    it("creates a new conversation and selects it", async () => {
      await useChatStore.getState().createConversation();
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.currentConversationId).toBe(state.conversations[0].id);
    });

    it("sets default title 'New Chat'", async () => {
      await useChatStore.getState().createConversation();
      expect(useChatStore.getState().conversations[0].title).toBe("New Chat");
    });

    it("clears context files on creation", async () => {
      useChatStore.setState({
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      await useChatStore.getState().createConversation();
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });

    it("prepends the new conversation to the list (select=true)", async () => {
      const existing = makeConversation({ id: "existing" });
      useChatStore.setState({ conversations: [existing] });
      await useChatStore.getState().createConversation();
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0].id).not.toBe("existing");
      expect(state.conversations[1].id).toBe("existing");
    });

    it("sets the path based on app data dir when no folder", async () => {
      await useChatStore.getState().createConversation();
      const conv = useChatStore.getState().conversations[0];
      expect(conv.path).toContain("/mock-data/chats/");
      expect(conv.path).toMatch(/\.json$/);
    });

    it("sets path within folder when folderId is provided and folder exists in tree", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/my-folder",
      });
      useChatStore.setState({ chatTree: [folder] });
      await useChatStore.getState().createConversation("f1");
      const conv = useChatStore.getState().conversations[0];
      expect(conv.path).toContain("/mock-data/chats/my-folder/");
    });

    it("falls back to default path when folderId not found in tree", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().createConversation("nonexistent-folder");
      const conv = useChatStore.getState().conversations[0];
      expect(conv.path).toContain("/mock-data/chats/");
    });

    it("creates conversation with empty messages", async () => {
      await useChatStore.getState().createConversation();
      expect(useChatStore.getState().conversations[0].messages).toEqual([]);
    });

    it("sets createdAt and updatedAt", async () => {
      await useChatStore.getState().createConversation();
      const conv = useChatStore.getState().conversations[0];
      expect(conv.createdAt).toBeInstanceOf(Date);
      expect(conv.updatedAt).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // createConversationInBackground
  // -----------------------------------------------------------------------
  describe("createConversationInBackground", () => {
    it("creates a conversation without selecting it", async () => {
      useChatStore.setState({ currentConversationId: null });
      await useChatStore.getState().createConversationInBackground();
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.currentConversationId).toBeNull();
    });

    it("appends to the end of the conversation list", async () => {
      const existing = makeConversation({ id: "existing" });
      useChatStore.setState({ conversations: [existing] });
      await useChatStore.getState().createConversationInBackground();
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0].id).toBe("existing");
    });

    it("uses provided title", async () => {
      await useChatStore.getState().createConversationInBackground({ title: "Background Task" });
      expect(useChatStore.getState().conversations[0].title).toBe("Background Task");
    });

    it("defaults to 'New Chat' when no title given", async () => {
      await useChatStore.getState().createConversationInBackground();
      expect(useChatStore.getState().conversations[0].title).toBe("New Chat");
    });

    it("marks conversation as background", async () => {
      const conv = await useChatStore.getState().createConversationInBackground();
      expect(conv.background).toBe(true);
    });

    it("returns the created conversation object", async () => {
      const conv = await useChatStore.getState().createConversationInBackground({ title: "BG" });
      expect(conv).toBeDefined();
      expect(conv.title).toBe("BG");
      expect(conv.id).toBeDefined();
    });

    it("uses folderId when provided", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/my-folder",
      });
      useChatStore.setState({ chatTree: [folder] });
      const conv = await useChatStore.getState().createConversationInBackground({ folderId: "f1" });
      expect(conv.path).toContain("/mock-data/chats/my-folder/");
    });

    it("does not change currentConversationId when one already exists", async () => {
      useChatStore.setState({ currentConversationId: "existing-id" });
      await useChatStore.getState().createConversationInBackground();
      expect(useChatStore.getState().currentConversationId).toBe("existing-id");
    });
  });

  // -----------------------------------------------------------------------
  // deleteConversation
  // -----------------------------------------------------------------------
  describe("deleteConversation", () => {
    it("removes the conversation from the list", async () => {
      const c1 = makeConversation({ id: "c1" });
      const c2 = makeConversation({ id: "c2" });
      useChatStore.setState({
        conversations: [c1, c2],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe("c2");
    });

    it("selects the next conversation when current is deleted", async () => {
      const c1 = makeConversation({ id: "c1" });
      const c2 = makeConversation({ id: "c2" });
      useChatStore.setState({
        conversations: [c1, c2],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      expect(useChatStore.getState().currentConversationId).toBe("c2");
    });

    it("sets currentConversationId to null when last is deleted", async () => {
      const c1 = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [c1],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      expect(useChatStore.getState().currentConversationId).toBeNull();
    });

    it("does not change selection when deleting a non-selected conversation", async () => {
      const c1 = makeConversation({ id: "c1" });
      const c2 = makeConversation({ id: "c2" });
      useChatStore.setState({
        conversations: [c1, c2],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c2");
      expect(useChatStore.getState().currentConversationId).toBe("c1");
    });

    it("does nothing when deleting a nonexistent conversation", async () => {
      const c1 = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [c1],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("nonexistent");
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.currentConversationId).toBe("c1");
    });

    it("calls deleteChatByPath and reloads when Tauri is available and conversation has path", async () => {
      mockIsTauri.mockReturnValue(true);
      const c1 = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({
        conversations: [c1],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      expect(mockDeleteChatByPath).toHaveBeenCalledWith("/mock-data/chats/c1.json");
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does not call disk operations when isTauri returns false", async () => {
      mockIsTauri.mockReturnValue(false);
      const c1 = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({
        conversations: [c1],
        currentConversationId: "c1",
      });

      await useChatStore.getState().deleteConversation("c1");
      expect(mockDeleteChatByPath).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // selectConversation
  // -----------------------------------------------------------------------
  describe("selectConversation", () => {
    it("sets the currentConversationId", async () => {
      const c1 = makeConversation({ id: "c1" });
      useChatStore.setState({ conversations: [c1] });
      await useChatStore.getState().selectConversation("c1");
      expect(useChatStore.getState().currentConversationId).toBe("c1");
    });

    it("clears context files on selection", async () => {
      const c1 = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [c1],
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      await useChatStore.getState().selectConversation("c1");
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });

    it("selects ghost conversation when in ghost mode", async () => {
      const ghost = makeConversation({ id: "ghost-1" });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
      });
      await useChatStore.getState().selectConversation("ghost-1");
      expect(useChatStore.getState().currentConversationId).toBe("ghost-1");
    });

    it("does not load from disk if conversation already has messages", async () => {
      const c1 = makeConversation({
        id: "c1",
        path: "/mock-data/chats/c1.json",
        messages: [makeMessage()],
      });
      useChatStore.setState({ conversations: [c1] });
      await useChatStore.getState().selectConversation("c1");
      expect(mockLoadChatByPath).not.toHaveBeenCalled();
    });

    it("loads from disk if conversation has path and no messages", async () => {
      const c1 = makeConversation({
        id: "c1",
        path: "/mock-data/chats/c1.json",
        messages: [],
      });
      mockLoadChatByPath.mockResolvedValueOnce({
        id: "c1",
        title: "Loaded Title",
        model: "gpt-4o",
        agentId: null,
        messages: [
          {
            id: "m1",
            role: "user" as const,
            content: "Hello",
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      });
      useChatStore.setState({ conversations: [c1] });

      await useChatStore.getState().selectConversation("c1");

      expect(mockLoadChatByPath).toHaveBeenCalledWith("/mock-data/chats/c1.json");
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("Loaded Title");
      expect(updated?.messages).toHaveLength(1);
      expect(updated?.messages[0].content).toBe("Hello");
    });

    it("marks pending/executing tool calls as error when loading from disk", async () => {
      const c1 = makeConversation({
        id: "c1",
        path: "/mock-data/chats/c1.json",
        messages: [],
      });
      mockLoadChatByPath.mockResolvedValueOnce({
        id: "c1",
        title: "With Tools",
        model: "gpt-4o",
        agentId: null,
        messages: [
          {
            id: "m1",
            role: "assistant" as const,
            content: "Using tool...",
            createdAt: "2025-01-01T00:00:00.000Z",
            toolCalls: [
              { id: "tc1", name: "read_file", arguments: {}, status: "pending", result: undefined, error: undefined },
              { id: "tc2", name: "write_file", arguments: {}, status: "executing", result: undefined, error: undefined },
              { id: "tc3", name: "done", arguments: {}, status: "success", result: "ok", error: undefined },
              { id: "tc4", name: "legacy_done", arguments: {}, status: "completed", result: "legacy ok", error: undefined },
              { id: "tc5", name: "legacy_fail", arguments: {}, status: "failed", result: undefined, error: "legacy err" },
              { id: "tc6", name: "awaiting", arguments: {}, status: "awaiting_approval", result: undefined, error: undefined },
            ],
          },
        ],
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      });
      useChatStore.setState({ conversations: [c1] });

      await useChatStore.getState().selectConversation("c1");

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      const toolCalls = updated?.messages[0].toolCalls;
      expect(toolCalls).toHaveLength(6);
      expect(toolCalls![0].status).toBe("error");
      expect(toolCalls![0].error).toBe("Interrupted — app closed during execution");
      expect(toolCalls![1].status).toBe("error");
      expect(toolCalls![1].error).toBe("Interrupted — app closed during execution");
      expect(toolCalls![2].status).toBe("success");
      expect(toolCalls![3].status).toBe("success");
      expect(toolCalls![3].result).toBe("legacy ok");
      expect(toolCalls![4].status).toBe("error");
      expect(toolCalls![4].error).toBe("legacy err");
      expect(toolCalls![5].status).toBe("error");
      expect(toolCalls![5].error).toBe("Interrupted — app closed during execution");
    });

    it("does not call loadChatByPath if conversation has no path", async () => {
      const c1 = makeConversation({ id: "c1", path: undefined, messages: [] });
      useChatStore.setState({ conversations: [c1] });
      await useChatStore.getState().selectConversation("c1");
      expect(mockLoadChatByPath).not.toHaveBeenCalled();
    });

    it("does not crash when loadChatByPath returns null", async () => {
      const c1 = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json", messages: [] });
      mockLoadChatByPath.mockResolvedValueOnce(null);
      useChatStore.setState({ conversations: [c1] });
      await useChatStore.getState().selectConversation("c1");
      // Conversation remains unchanged
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.messages).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // toggleFolderExpansion
  // -----------------------------------------------------------------------
  describe("toggleFolderExpansion", () => {
    it("adds a folder to expanded set", () => {
      useChatStore.getState().toggleFolderExpansion("folder-1");
      expect(useChatStore.getState().expandedFolders.has("folder-1")).toBe(true);
    });

    it("removes a folder from expanded set on second toggle", () => {
      useChatStore.getState().toggleFolderExpansion("folder-1");
      useChatStore.getState().toggleFolderExpansion("folder-1");
      expect(useChatStore.getState().expandedFolders.has("folder-1")).toBe(false);
    });

    it("handles multiple folders independently", () => {
      useChatStore.getState().toggleFolderExpansion("f1");
      useChatStore.getState().toggleFolderExpansion("f2");
      const expanded = useChatStore.getState().expandedFolders;
      expect(expanded.has("f1")).toBe(true);
      expect(expanded.has("f2")).toBe(true);
    });

    it("third toggle re-adds the folder", () => {
      useChatStore.getState().toggleFolderExpansion("f1");
      useChatStore.getState().toggleFolderExpansion("f1");
      useChatStore.getState().toggleFolderExpansion("f1");
      expect(useChatStore.getState().expandedFolders.has("f1")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Ghost mode
  // -----------------------------------------------------------------------
  describe("ghost mode", () => {
    it("starts a ghost session", () => {
      useChatStore.getState().startGhostSession();
      const state = useChatStore.getState();
      expect(state.isGhostMode).toBe(true);
      expect(state.ghostConversation).toBeNull();
      expect(state.currentConversationId).toBeNull();
    });

    it("exits a ghost session and restores first conversation", () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        isGhostMode: true,
        ghostConversation: makeConversation({ id: "ghost" }),
        currentConversationId: "ghost",
      });

      useChatStore.getState().exitGhostSession();
      const state = useChatStore.getState();
      expect(state.isGhostMode).toBe(false);
      expect(state.ghostConversation).toBeNull();
      expect(state.currentConversationId).toBe("c1");
    });

    it("exits ghost session with null id when no conversations exist", () => {
      useChatStore.setState({
        conversations: [],
        isGhostMode: true,
        ghostConversation: makeConversation({ id: "ghost" }),
      });

      useChatStore.getState().exitGhostSession();
      expect(useChatStore.getState().currentConversationId).toBeNull();
    });

    it("starting ghost session preserves existing conversations", () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({ conversations: [conv], currentConversationId: "c1" });
      useChatStore.getState().startGhostSession();
      expect(useChatStore.getState().conversations).toHaveLength(1);
    });

    it("exiting ghost session clears ghostConversation even when conversations exist", () => {
      const ghost = makeConversation({ id: "ghost" });
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        isGhostMode: true,
        ghostConversation: ghost,
        currentConversationId: "ghost",
      });
      useChatStore.getState().exitGhostSession();
      expect(useChatStore.getState().ghostConversation).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Context files
  // -----------------------------------------------------------------------
  describe("context files", () => {
    it("removeContextFile removes by path", () => {
      useChatStore.setState({
        contextFiles: [
          { path: "/a.txt", name: "a.txt", content: "a" },
          { path: "/b.txt", name: "b.txt", content: "b" },
        ],
      });
      useChatStore.getState().removeContextFile("/a.txt");
      const files = useChatStore.getState().contextFiles;
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe("/b.txt");
    });

    it("clearContextFiles empties the list", () => {
      useChatStore.setState({
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      useChatStore.getState().clearContextFiles();
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });

    it("removeContextFile does nothing if path not found", () => {
      useChatStore.setState({
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      useChatStore.getState().removeContextFile("/nonexistent.txt");
      expect(useChatStore.getState().contextFiles).toHaveLength(1);
    });

    it("clearContextFiles on already empty list is a no-op", () => {
      useChatStore.setState({ contextFiles: [] });
      useChatStore.getState().clearContextFiles();
      expect(useChatStore.getState().contextFiles).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // addContextFiles
  // -----------------------------------------------------------------------
  describe("addContextFiles", () => {
    it("adds files by reading their contents", async () => {
      mockReadFile.mockResolvedValue("file content here");
      await useChatStore.getState().addContextFiles(["/test/file.txt"]);
      const files = useChatStore.getState().contextFiles;
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe("/test/file.txt");
      expect(files[0].name).toBe("file.txt");
      expect(files[0].content).toBe("file content here");
    });

    it("extracts filename from path", async () => {
      mockReadFile.mockResolvedValue("data");
      await useChatStore.getState().addContextFiles(["/some/deep/path/myfile.ts"]);
      expect(useChatStore.getState().contextFiles[0].name).toBe("myfile.ts");
    });

    it("skips duplicate paths", async () => {
      useChatStore.setState({
        contextFiles: [{ path: "/a.txt", name: "a.txt", content: "a" }],
      });
      mockReadFile.mockResolvedValue("new content");
      await useChatStore.getState().addContextFiles(["/a.txt"]);
      expect(useChatStore.getState().contextFiles).toHaveLength(1);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it("adds multiple files at once", async () => {
      mockReadFile.mockResolvedValue("content");
      await useChatStore.getState().addContextFiles(["/a.txt", "/b.txt", "/c.txt"]);
      expect(useChatStore.getState().contextFiles).toHaveLength(3);
    });

    it("truncates files over 50,000 characters", async () => {
      const longContent = "x".repeat(60_000);
      mockReadFile.mockResolvedValue(longContent);
      await useChatStore.getState().addContextFiles(["/big.txt"]);
      const file = useChatStore.getState().contextFiles[0];
      expect(file.content.length).toBeLessThan(60_000);
      expect(file.content).toContain("... (truncated)");
    });

    it("handles file read errors gracefully", async () => {
      mockReadFile.mockRejectedValueOnce(new Error("Permission denied"));
      await useChatStore.getState().addContextFiles(["/forbidden.txt"]);
      expect(useChatStore.getState().contextFiles).toHaveLength(0);
    });

    it("reads some files even when others fail", async () => {
      mockReadFile
        .mockResolvedValueOnce("good content")
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("also good");
      await useChatStore.getState().addContextFiles(["/a.txt", "/b.txt", "/c.txt"]);
      expect(useChatStore.getState().contextFiles).toHaveLength(2);
    });

    it("does nothing when given empty array", async () => {
      await useChatStore.getState().addContextFiles([]);
      expect(useChatStore.getState().contextFiles).toEqual([]);
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // renameChat (in-memory part)
  // -----------------------------------------------------------------------
  describe("renameChat", () => {
    it("updates the conversation title in memory", async () => {
      const conv = makeConversation({ id: "c1", title: "Old Title" });
      useChatStore.setState({ conversations: [conv] });

      await useChatStore.getState().renameChat("c1", "New Title");
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("New Title");
    });

    it("updates the updatedAt timestamp", async () => {
      const conv = makeConversation({ id: "c1", updatedAt: new Date("2020-01-01") });
      useChatStore.setState({ conversations: [conv] });

      await useChatStore.getState().renameChat("c1", "New Title");
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(new Date("2020-01-01").getTime());
    });

    it("does not affect other conversations", async () => {
      const c1 = makeConversation({ id: "c1", title: "Chat 1" });
      const c2 = makeConversation({ id: "c2", title: "Chat 2" });
      useChatStore.setState({ conversations: [c1, c2] });

      await useChatStore.getState().renameChat("c1", "Renamed");
      expect(useChatStore.getState().conversations.find((c) => c.id === "c2")?.title).toBe("Chat 2");
    });

    it("saves to disk when Tauri is available and conversation has path", async () => {
      mockIsTauri.mockReturnValue(true);
      const conv = makeConversation({ id: "c1", title: "Old", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({ conversations: [conv] });

      await useChatStore.getState().renameChat("c1", "New Title");
      expect(mockSaveChatToFolder).toHaveBeenCalled();
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does not save to disk when isTauri is false", async () => {
      mockIsTauri.mockReturnValue(false);
      const conv = makeConversation({ id: "c1", title: "Old" });
      useChatStore.setState({ conversations: [conv] });

      await useChatStore.getState().renameChat("c1", "New Title");
      expect(mockSaveChatToFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // moveConversation
  // -----------------------------------------------------------------------
  describe("moveConversation", () => {
    it("moves a conversation into a folder", async () => {
      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      const folder = makeFolderTreeNode({ id: "folder-1", path: "/mock-data/chats/Work" });
      useChatStore.setState({ conversations: [conv], chatTree: [folder] });

      await useChatStore.getState().moveConversation("c1", "folder-1");

      expect(mockRenamePath).toHaveBeenCalledWith(
        "/mock-data/chats/c1.json",
        "/mock-data/chats/Work/c1.json"
      );
      expect(mockLoadChatTree).toHaveBeenCalled();
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.path).toBe("/mock-data/chats/Work/c1.json");
      expect(updated?.folderId).toBe("folder-1");
    });

    it("moves a conversation back to the root", async () => {
      const conv = makeConversation({
        id: "c1",
        path: "/mock-data/chats/Work/c1.json",
        folderId: "folder-1",
      });
      useChatStore.setState({ conversations: [conv], chatTree: [] });

      await useChatStore.getState().moveConversation("c1", null);

      expect(mockRenamePath).toHaveBeenCalledWith(
        "/mock-data/chats/Work/c1.json",
        "/mock-data/chats/c1.json"
      );
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.folderId).toBeUndefined();
    });

    it("is a no-op when the conversation has no path", async () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({ conversations: [conv], chatTree: [] });

      await useChatStore.getState().moveConversation("c1", null);
      expect(mockRenamePath).not.toHaveBeenCalled();
    });

    it("is a no-op when the target folder does not exist", async () => {
      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({ conversations: [conv], chatTree: [] });

      await useChatStore.getState().moveConversation("c1", "missing-folder");
      expect(mockRenamePath).not.toHaveBeenCalled();
    });

    it("is a no-op when the conversation is already in the target folder", async () => {
      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({ conversations: [conv], chatTree: [] });

      await useChatStore.getState().moveConversation("c1", null);
      expect(mockRenamePath).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // loadChatsFromDisk
  // -----------------------------------------------------------------------
  describe("loadChatsFromDisk", () => {
    it("loads tree and syncs conversations", async () => {
      const chatNode = makeChatTreeNode({
        id: "chat-from-disk",
        name: "Disk Chat",
        title: "Disk Chat Title",
        path: "/mock-data/chats/chat-from-disk.json",
        updatedAt: "2025-06-01T00:00:00.000Z",
      });
      mockLoadChatTree.mockResolvedValueOnce([chatNode]);

      await useChatStore.getState().loadChatsFromDisk();

      const state = useChatStore.getState();
      expect(state.chatTree).toEqual([chatNode]);
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe("chat-from-disk");
      expect(state.conversations[0].title).toBe("Disk Chat Title");
      expect(state.conversations[0].path).toBe("/mock-data/chats/chat-from-disk.json");
    });

    it("preserves in-memory messages when syncing from tree", async () => {
      const existingConv = makeConversation({
        id: "c1",
        messages: [makeMessage({ id: "m1", content: "In memory" })],
      });
      useChatStore.setState({ conversations: [existingConv] });

      const chatNode = makeChatTreeNode({ id: "c1", title: "Updated Title" });
      mockLoadChatTree.mockResolvedValueOnce([chatNode]);

      await useChatStore.getState().loadChatsFromDisk();

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.messages).toHaveLength(1);
      expect(updated?.messages[0].content).toBe("In memory");
    });

    it("keeps in-memory-only conversations that are not on disk", async () => {
      const memOnly = makeConversation({ id: "mem-only" });
      useChatStore.setState({ conversations: [memOnly] });

      const diskChat = makeChatTreeNode({ id: "disk-only", title: "Disk Only" });
      mockLoadChatTree.mockResolvedValueOnce([diskChat]);

      await useChatStore.getState().loadChatsFromDisk();

      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations.some((c) => c.id === "mem-only")).toBe(true);
      expect(state.conversations.some((c) => c.id === "disk-only")).toBe(true);
    });

    it("processes nested folder trees", async () => {
      const nestedChat = makeChatTreeNode({
        id: "nested-chat",
        title: "Nested",
        path: "/mock-data/chats/folder-1/nested-chat.json",
      });
      const folder = makeFolderTreeNode({
        id: "folder-1",
        children: [nestedChat],
      });
      mockLoadChatTree.mockResolvedValueOnce([folder]);

      await useChatStore.getState().loadChatsFromDisk();

      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe("nested-chat");
    });

    it("uses 'Untitled' for chats without a title", async () => {
      const chatNode = makeChatTreeNode({ id: "no-title", title: undefined, name: "no-title.json" });
      mockLoadChatTree.mockResolvedValueOnce([chatNode]);

      await useChatStore.getState().loadChatsFromDisk();

      expect(useChatStore.getState().conversations[0].title).toBe("Untitled");
    });

    it("handles loadChatTree failure gracefully", async () => {
      mockLoadChatTree.mockRejectedValueOnce(new Error("Disk error"));
      await useChatStore.getState().loadChatsFromDisk();
      // Should not throw, state stays as-is
      expect(useChatStore.getState().chatTree).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // createFolder
  // -----------------------------------------------------------------------
  describe("createFolder", () => {
    it("calls createChatFolder and reloads", async () => {
      await useChatStore.getState().createFolder("New Folder");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("New Folder", undefined);
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("generates unique name when sibling folder has same name", async () => {
      const existingFolder = makeFolderTreeNode({ id: "f1", name: "Projects" });
      useChatStore.setState({ chatTree: [existingFolder] });

      await useChatStore.getState().createFolder("Projects");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Projects 2", undefined);
    });

    it("generates unique name with incrementing counter", async () => {
      const f1 = makeFolderTreeNode({ id: "f1", name: "Projects" });
      const f2 = makeFolderTreeNode({ id: "f2", name: "Projects 2" });
      useChatStore.setState({ chatTree: [f1, f2] });

      await useChatStore.getState().createFolder("Projects");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Projects 3", undefined);
    });

    it("uses parent folder path when parentFolderId is provided", async () => {
      const parentFolder = makeFolderTreeNode({
        id: "parent",
        name: "Parent",
        path: "/mock-data/chats/parent",
        children: [],
      });
      useChatStore.setState({ chatTree: [parentFolder] });

      await useChatStore.getState().createFolder("Child", "parent");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Child", "/mock-data/chats/parent");
    });

    it("handles createChatFolder error gracefully", async () => {
      mockCreateChatFolder.mockRejectedValueOnce(new Error("Disk full"));
      await useChatStore.getState().createFolder("Bad Folder");
      // Should not throw
    });

    it("avoids duplicate name among children of parent folder", async () => {
      const childFolder = makeFolderTreeNode({ id: "child", name: "Existing" });
      const parentFolder = makeFolderTreeNode({
        id: "parent",
        name: "Parent",
        path: "/mock-data/chats/parent",
        children: [childFolder],
      });
      useChatStore.setState({ chatTree: [parentFolder] });

      await useChatStore.getState().createFolder("Existing", "parent");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Existing 2", "/mock-data/chats/parent");
    });
  });

  // -----------------------------------------------------------------------
  // renameFolder
  // -----------------------------------------------------------------------
  describe("renameFolder", () => {
    it("renames a folder and reloads from disk", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        name: "Old Name",
        path: "/mock-data/chats/old-name",
      });
      useChatStore.setState({ chatTree: [folder] });

      await useChatStore.getState().renameFolder("f1", "New Name");
      expect(mockRenameChatFolder).toHaveBeenCalledWith("/mock-data/chats/old-name", "New Name");
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does nothing if folder not found in tree", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().renameFolder("nonexistent", "New Name");
      expect(mockRenameChatFolder).not.toHaveBeenCalled();
    });

    it("does nothing if node is a chat, not a folder", async () => {
      const chatNode = makeChatTreeNode({ id: "c1" });
      useChatStore.setState({ chatTree: [chatNode] });
      await useChatStore.getState().renameFolder("c1", "New Name");
      expect(mockRenameChatFolder).not.toHaveBeenCalled();
    });

    it("handles rename failure gracefully", async () => {
      const folder = makeFolderTreeNode({ id: "f1", path: "/mock-data/chats/f1" });
      useChatStore.setState({ chatTree: [folder] });
      mockRenameChatFolder.mockRejectedValueOnce(new Error("Permission denied"));
      await useChatStore.getState().renameFolder("f1", "New Name");
      // Should not throw
    });
  });

  // -----------------------------------------------------------------------
  // deleteFolder
  // -----------------------------------------------------------------------
  describe("deleteFolder", () => {
    it("deletes a folder and reloads from disk", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/f1",
      });
      useChatStore.setState({ chatTree: [folder] });

      await useChatStore.getState().deleteFolder("f1");
      expect(mockDeleteChatFolder).toHaveBeenCalledWith("/mock-data/chats/f1");
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("does nothing if folder not found in tree", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().deleteFolder("nonexistent");
      expect(mockDeleteChatFolder).not.toHaveBeenCalled();
    });

    it("does nothing if node is a chat, not a folder", async () => {
      const chatNode = makeChatTreeNode({ id: "c1" });
      useChatStore.setState({ chatTree: [chatNode] });
      await useChatStore.getState().deleteFolder("c1");
      expect(mockDeleteChatFolder).not.toHaveBeenCalled();
    });

    it("handles delete failure gracefully", async () => {
      const folder = makeFolderTreeNode({ id: "f1", path: "/mock-data/chats/f1" });
      useChatStore.setState({ chatTree: [folder] });
      mockDeleteChatFolder.mockRejectedValueOnce(new Error("In use"));
      await useChatStore.getState().deleteFolder("f1");
      // Should not throw
    });
  });

  // -----------------------------------------------------------------------
  // toggleFolderPin
  // -----------------------------------------------------------------------
  describe("toggleFolderPin", () => {
    it("pins an unpinned folder", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/f1",
        isPinned: false,
      });
      useChatStore.setState({ chatTree: [folder] });
      mockLoadFolderMeta.mockResolvedValueOnce(null);

      await useChatStore.getState().toggleFolderPin("f1");

      expect(mockSaveFolderMeta).toHaveBeenCalledWith(
        "/mock-data/chats/f1",
        expect.objectContaining({ isPinned: true }),
      );
      expect(mockLoadChatTree).toHaveBeenCalled();
    });

    it("unpins a pinned folder", async () => {
      const folder = makeFolderTreeNode({
        id: "f1",
        path: "/mock-data/chats/f1",
        isPinned: true,
      });
      useChatStore.setState({ chatTree: [folder] });
      mockLoadFolderMeta.mockResolvedValueOnce({
        isPinned: true,
        createdAt: "2025-01-01T00:00:00.000Z",
      });

      await useChatStore.getState().toggleFolderPin("f1");

      expect(mockSaveFolderMeta).toHaveBeenCalledWith(
        "/mock-data/chats/f1",
        expect.objectContaining({ isPinned: false, createdAt: "2025-01-01T00:00:00.000Z" }),
      );
    });

    it("does nothing if folder not found in tree", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().toggleFolderPin("nonexistent");
      expect(mockLoadFolderMeta).not.toHaveBeenCalled();
      expect(mockSaveFolderMeta).not.toHaveBeenCalled();
    });

    it("does nothing if node is a chat, not a folder", async () => {
      const chatNode = makeChatTreeNode({ id: "c1" });
      useChatStore.setState({ chatTree: [chatNode] });
      await useChatStore.getState().toggleFolderPin("c1");
      expect(mockLoadFolderMeta).not.toHaveBeenCalled();
    });

    it("handles errors gracefully", async () => {
      const folder = makeFolderTreeNode({ id: "f1", path: "/mock-data/chats/f1" });
      useChatStore.setState({ chatTree: [folder] });
      mockLoadFolderMeta.mockRejectedValueOnce(new Error("Disk error"));
      await useChatStore.getState().toggleFolderPin("f1");
      // Should not throw
    });

    it("finds nested folders in tree", async () => {
      const nestedFolder = makeFolderTreeNode({
        id: "nested",
        name: "Nested",
        path: "/mock-data/chats/parent/nested",
        children: [],
      });
      const parentFolder = makeFolderTreeNode({
        id: "parent",
        name: "Parent",
        path: "/mock-data/chats/parent",
        children: [nestedFolder],
      });
      useChatStore.setState({ chatTree: [parentFolder] });
      mockLoadFolderMeta.mockResolvedValueOnce(null);

      await useChatStore.getState().toggleFolderPin("nested");

      expect(mockSaveFolderMeta).toHaveBeenCalledWith(
        "/mock-data/chats/parent/nested",
        expect.objectContaining({ isPinned: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // markToolCallsStopped
  // -----------------------------------------------------------------------
  describe("markToolCallsStopped", () => {
    it("marks pending tool calls as stopped", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [
          { id: "tc1", name: "tool1", arguments: {}, status: "pending" },
          { id: "tc2", name: "tool2", arguments: {}, status: "executing" },
          { id: "tc3", name: "tool3", arguments: {}, status: "success" },
        ],
      });
      const conv = makeConversation({ id: "c1", messages: [msg] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c1");

      const updated = useChatStore.getState().conversations[0].messages[0];
      expect(updated.toolCalls![0].status).toBe("stopped");
      expect(updated.toolCalls![1].status).toBe("stopped");
      expect(updated.toolCalls![2].status).toBe("success"); // unchanged
    });

    it("does not modify conversations without the matching id", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "tool1", arguments: {}, status: "pending" }],
      });
      const conv = makeConversation({ id: "c1", messages: [msg] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c-other");

      const unchanged = useChatStore.getState().conversations[0].messages[0];
      expect(unchanged.toolCalls![0].status).toBe("pending");
    });

    it("marks ghost conversation tool calls as stopped", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "tool1", arguments: {}, status: "executing" }],
      });
      const ghost = makeConversation({ id: "ghost-1", messages: [msg] });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
      });

      useChatStore.getState().markToolCallsStopped("ghost-1");

      const updated = useChatStore.getState().ghostConversation!.messages[0];
      expect(updated.toolCalls![0].status).toBe("stopped");
    });

    it("does not change messages without tool calls", () => {
      const msg = makeMessage({ id: "m1", role: "assistant", content: "Hello" });
      const conv = makeConversation({ id: "c1", messages: [msg] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c1");

      const unchanged = useChatStore.getState().conversations[0].messages[0];
      expect(unchanged.toolCalls).toBeUndefined();
      expect(unchanged.content).toBe("Hello");
    });

    it("marks pending_confirmation tool calls as stopped", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [
          { id: "tc1", name: "tool1", arguments: {}, status: "pending_confirmation" },
        ],
      });
      const conv = makeConversation({ id: "c1", messages: [msg] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c1");

      const updated = useChatStore.getState().conversations[0].messages[0];
      expect(updated.toolCalls![0].status).toBe("stopped");
    });

    it("handles multiple messages in conversation", () => {
      const msg1 = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "tool1", arguments: {}, status: "pending" }],
      });
      const msg2 = makeMessage({
        id: "m2",
        role: "assistant",
        toolCalls: [{ id: "tc2", name: "tool2", arguments: {}, status: "executing" }],
      });
      const conv = makeConversation({ id: "c1", messages: [msg1, msg2] });
      useChatStore.setState({ conversations: [conv] });

      useChatStore.getState().markToolCallsStopped("c1");

      const updated = useChatStore.getState().conversations[0];
      expect(updated.messages[0].toolCalls![0].status).toBe("stopped");
      expect(updated.messages[1].toolCalls![0].status).toBe("stopped");
    });

    it("does not modify ghost conversation when id doesn't match", () => {
      const msg = makeMessage({
        id: "m1",
        role: "assistant",
        toolCalls: [{ id: "tc1", name: "tool1", arguments: {}, status: "pending" }],
      });
      const ghost = makeConversation({ id: "ghost-1", messages: [msg] });
      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: ghost,
      });

      useChatStore.getState().markToolCallsStopped("different-id");

      const unchanged = useChatStore.getState().ghostConversation!.messages[0];
      expect(unchanged.toolCalls![0].status).toBe("pending");
    });
  });

  // -----------------------------------------------------------------------
  // confirmToolExecution
  // -----------------------------------------------------------------------
  describe("confirmToolExecution", () => {
    it("delegates to agentic loop store confirmTool", async () => {
      useChatStore.setState({ currentConversationId: "c1" });
      await useChatStore.getState().confirmToolExecution("tc-1");
      expect(mockConfirmTool).toHaveBeenCalledWith("c1", "tc-1");
    });

    it("does nothing when no conversation is selected", async () => {
      useChatStore.setState({ currentConversationId: null });
      await useChatStore.getState().confirmToolExecution("tc-1");
      expect(mockConfirmTool).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // rejectToolExecution
  // -----------------------------------------------------------------------
  describe("rejectToolExecution", () => {
    it("delegates to agentic loop store rejectTool", () => {
      useChatStore.setState({ currentConversationId: "c1" });
      useChatStore.getState().rejectToolExecution("tc-1");
      expect(mockRejectTool).toHaveBeenCalledWith("c1", "tc-1", "Rejected by user");
    });

    it("marks the rejected tool call as cancelled in conversation state", () => {
      const conv = makeConversation({
        id: "c1",
        messages: [
          makeMessage({
            id: "m1",
            role: "assistant",
            toolCalls: [
              { id: "tc-1", name: "write_file", arguments: {}, status: "pending_confirmation" },
            ],
          }),
        ],
      });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      useChatStore.getState().rejectToolExecution("tc-1");

      const updated = useChatStore.getState().conversations[0].messages[0].toolCalls?.[0];
      expect(updated?.status).toBe("cancelled");
      expect(updated?.error).toBe("Rejected by user");
    });

    it("does nothing when no conversation is selected", () => {
      useChatStore.setState({ currentConversationId: null });
      useChatStore.getState().rejectToolExecution("tc-1");
      expect(mockRejectTool).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // sendMessage
  // -----------------------------------------------------------------------
  describe("sendMessage", () => {
    it("creates a new conversation if none exists", async () => {
      // streamSimple will be called since we're not in Tauri mode
      // Make it return an empty async iterable
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hello!" };
        })(),
      );

      useChatStore.setState({ currentConversationId: null, conversations: [] });
      await useChatStore.getState().sendMessage("Hi there");

      const state = useChatStore.getState();
      // A conversation was created
      expect(state.conversations.length).toBeGreaterThanOrEqual(1);
      expect(state.isStreaming).toBe(false);
    });

    it("creates ghost conversation when in ghost mode without existing ghost", async () => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Ghost reply" };
        })(),
      );

      useChatStore.setState({
        isGhostMode: true,
        ghostConversation: null,
        currentConversationId: null,
      });
      await useChatStore.getState().sendMessage("Ghost message");

      const state = useChatStore.getState();
      expect(state.ghostConversation).not.toBeNull();
      expect(state.ghostConversation?.title).toBe("Incognito Session");
    });

    it("sets isStreaming to true during execution and false after", async () => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });

      let streamingDuringExec = false;
      mockStreamSimple.mockReturnValue(
        (async function* () {
          streamingDuringExec = useChatStore.getState().isStreaming;
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );

      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });
      await useChatStore.getState().sendMessage("Hello");

      expect(streamingDuringExec).toBe(true);
      expect(useChatStore.getState().isStreaming).toBe(false);
    });

    it("handles stream error gracefully", async () => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "error", error: { errorMessage: "Rate limited" } };
        })(),
      );

      const conv = makeConversation({ id: "c1", path: "/mock-data/chats/c1.json" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage("Hello");
      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(false);
      // The error message should be in the assistant's content
      const lastMsg = state.conversations[0].messages[state.conversations[0].messages.length - 1];
      expect(lastMsg.content).toContain("Rate limited");
    });

    it("shows error when model not found and no API key", async () => {
      mockGetActiveModels.mockReturnValue([]);
      mockGetModel.mockReturnValue(null);
      mockSettingsGetState.mockReturnValue({
        apiKeys: {},
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });

      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
        model: "claude-sonnet-4-20250514",
      });
      await useChatStore.getState().sendMessage("Hello");

      const state = useChatStore.getState();
      const lastMsg = state.conversations[0].messages[state.conversations[0].messages.length - 1];
      expect(lastMsg.role).toBe("assistant");
      expect(lastMsg.content).toContain("Unknown model");
    });

    it("shows error when local LLM is disabled", async () => {
      mockSettingsGetState.mockReturnValue({
        apiKeys: {},
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });

      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
        model: "local",
      });
      await useChatStore.getState().sendMessage("Hello");

      const state = useChatStore.getState();
      const lastMsg = state.conversations[0].messages[state.conversations[0].messages.length - 1];
      expect(lastMsg.content).toContain("Local LLM is disabled");
    });
  });

  // -----------------------------------------------------------------------
  // sendMessageToConversation
  // -----------------------------------------------------------------------
  describe("sendMessageToConversation", () => {
    it("sends to a specific conversation without setting streaming by default", async () => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Reply" };
        })(),
      );

      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({ conversations: [conv], currentConversationId: "c1" });

      await useChatStore.getState().sendMessageToConversation("c1", "Hello");
      const state = useChatStore.getState();
      // Messages should exist
      expect(state.conversations[0].messages.length).toBeGreaterThanOrEqual(2); // user + assistant
    });

    it("does nothing if conversation not found", async () => {
      useChatStore.setState({ conversations: [], currentConversationId: null });

      await useChatStore.getState().sendMessageToConversation("nonexistent", "Hello");
      // No crash, no state change
      expect(useChatStore.getState().conversations).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // findNodeInTree (tested through store behavior)
  // -----------------------------------------------------------------------
  describe("findNodeInTree (via store behavior)", () => {
    it("finds a top-level folder", async () => {
      const folder = makeFolderTreeNode({
        id: "top-folder",
        path: "/mock-data/chats/top-folder",
      });
      useChatStore.setState({ chatTree: [folder] });

      await useChatStore.getState().renameFolder("top-folder", "Renamed");
      expect(mockRenameChatFolder).toHaveBeenCalledWith("/mock-data/chats/top-folder", "Renamed");
    });

    it("finds a deeply nested folder", async () => {
      const deepFolder = makeFolderTreeNode({
        id: "deep",
        name: "Deep",
        path: "/mock-data/chats/a/b/deep",
        children: [],
      });
      const midFolder = makeFolderTreeNode({
        id: "mid",
        name: "Mid",
        path: "/mock-data/chats/a/b",
        children: [deepFolder],
      });
      const topFolder = makeFolderTreeNode({
        id: "top",
        name: "Top",
        path: "/mock-data/chats/a",
        children: [midFolder],
      });
      useChatStore.setState({ chatTree: [topFolder] });

      await useChatStore.getState().deleteFolder("deep");
      expect(mockDeleteChatFolder).toHaveBeenCalledWith("/mock-data/chats/a/b/deep");
    });

    it("returns null when node not found (folder operations skip)", async () => {
      useChatStore.setState({ chatTree: [] });
      await useChatStore.getState().renameFolder("missing", "New Name");
      expect(mockRenameChatFolder).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Auto-rename behavior via sendMessage
  // -----------------------------------------------------------------------
  describe("auto-rename on first message", () => {
    beforeEach(() => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Response" };
        })(),
      );
    });

    it("renames 'New Chat' to the first user message content", async () => {
      const conv = makeConversation({ id: "c1", title: "New Chat", messages: [] });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage("What is TypeScript?");

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("What is TypeScript?");
    });

    it("does not rename when conversation already has custom title", async () => {
      const conv = makeConversation({ id: "c1", title: "My Custom Chat", messages: [] });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage("Hello");

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("My Custom Chat");
    });

    it("does not rename when it is not the first message", async () => {
      const conv = makeConversation({
        id: "c1",
        title: "New Chat",
        messages: [makeMessage({ content: "Previous" })],
      });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage("Hello again");

      // Title stays "New Chat" because there's already a message
      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title).toBe("New Chat");
    });

    it("truncates title to 50 characters", async () => {
      const longMsg = "A".repeat(100);
      const conv = makeConversation({ id: "c1", title: "New Chat", messages: [] });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
      });

      await useChatStore.getState().sendMessage(longMsg);

      const updated = useChatStore.getState().conversations.find((c) => c.id === "c1");
      expect(updated?.title?.length).toBeLessThanOrEqual(50);
    });
  });

  // -----------------------------------------------------------------------
  // Reasoning effort on the outgoing request
  // -----------------------------------------------------------------------
  //
  // Regression guard for a silent-drop failure mode: pi-ai's OpenRouter branch
  // is gated on `model.reasoning`, so a model reaching streamSimple without it
  // loses the effort no matter what the picker showed.
  describe("reasoning effort", () => {
    const OPENROUTER_MODEL = {
      id: "x-ai/grok-4.5",
      name: "Grok 4.5",
      provider: "openrouter",
      reasoning: {
        mandatory: true,
        supported_efforts: ["high", "medium", "low"],
        default_effort: "high",
      },
    };

    /** The model object handed to streamSimple for the last sendMessage. */
    const sentModel = () => mockStreamSimple.mock.calls.at(-1)?.[0];
    /** The options object handed to streamSimple for the last sendMessage. */
    const sentOptions = () => mockStreamSimple.mock.calls.at(-1)?.[2];

    function setup(overrides: Record<string, unknown> = {}) {
      mockGetActiveModels.mockReturnValue([OPENROUTER_MODEL]);
      mockSettingsGetState.mockReturnValue({
        apiKeys: { openrouter: "sk-or-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [OPENROUTER_MODEL],
        defaultModel: OPENROUTER_MODEL.id,
        ...overrides,
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "c1",
        model: OPENROUTER_MODEL.id,
      });
    }

    it("stamps the capability onto a model the registry already knows", async () => {
      setup();
      mockGetModel.mockReturnValue({
        id: OPENROUTER_MODEL.id,
        name: "Grok 4.5",
        api: "openai-completions",
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });

      await useChatStore.getState().sendMessage("Hello");

      // The registry says reasoning: false; OpenRouter's metadata overrides it.
      expect(sentModel()?.reasoning).toBe(true);
      expect(sentModel()?.thinkingLevelMap).toMatchObject({ high: "high", off: null });
    });

    it("stamps the capability onto a model the registry does not know", async () => {
      setup();
      mockGetModel.mockReturnValue(undefined);

      await useChatStore.getState().sendMessage("Hello");

      expect(sentModel()?.reasoning).toBe(true);
      expect(sentModel()?.thinkingLevelMap).toMatchObject({ high: "high", off: null });
    });

    it("forwards the stored effort for the model being used", async () => {
      setup({ modelEffort: { [OPENROUTER_MODEL.id]: "low" } });
      mockGetModel.mockReturnValue(undefined);

      await useChatStore.getState().sendMessage("Hello");

      expect(sentOptions()?.reasoning).toBe("low");
    });

    it("falls back to OpenRouter's own default when nothing is stored", async () => {
      setup();
      mockGetModel.mockReturnValue(undefined);

      await useChatStore.getState().sendMessage("Hello");

      expect(sentOptions()?.reasoning).toBe("high");
    });

    // OpenRouter's metadata is the only source of truth. pi-ai's registry carries
    // `reasoning: true` for 167 OpenRouter ids, and when it leaks through for a
    // model that exposes no discrete levels, pi-ai's OpenRouter branch falls into
    // its `else` and sends `reasoning: { effort: "none" }` — silently disabling
    // reasoning on a model the user was given no picker for.
    it("does not let the registry enable reasoning OpenRouter never advertised", async () => {
      // Verbatim shape of deepseek/deepseek-r1: reasoning, but no discrete levels.
      const noLevels = {
        id: "deepseek/deepseek-r1",
        name: "DeepSeek R1",
        provider: "openrouter",
        reasoning: { mandatory: true, default_enabled: true },
      };
      mockGetActiveModels.mockReturnValue([noLevels]);
      mockSettingsGetState.mockReturnValue({
        apiKeys: { openrouter: "sk-or-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [noLevels],
        defaultModel: noLevels.id,
      });
      // The registry's stale, coarser view of the same model.
      mockGetModel.mockReturnValue({
        id: noLevels.id,
        name: "DeepSeek R1",
        api: "openai-completions",
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        reasoning: true,
        thinkingLevelMap: { xhigh: "max" },
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "c1",
        model: noLevels.id,
      });

      await useChatStore.getState().sendMessage("Hello");

      expect(sentOptions()?.reasoning).toBeUndefined();
      // Either of these keeps pi-ai from emitting `reasoning: { effort: "none" }`;
      // the registry's own map must not survive.
      expect(sentModel()?.reasoning).toBe(false);
      expect(sentModel()?.thinkingLevelMap).toBeUndefined();
    });

    it("leaves a non-reasoning model untouched and sends no effort", async () => {
      const plain = { id: "gpt-4o", name: "GPT-4o", provider: "openai" };
      mockGetActiveModels.mockReturnValue([plain]);
      mockSettingsGetState.mockReturnValue({
        apiKeys: { openai: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [plain],
        defaultModel: plain.id,
        modelEffort: { "gpt-4o": "high" },
      });
      mockGetModel.mockReturnValue({
        id: "gpt-4o",
        name: "GPT-4o",
        api: "openai-completions",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Hi" };
        })(),
      );
      useChatStore.setState({
        conversations: [makeConversation({ id: "c1" })],
        currentConversationId: "c1",
        model: plain.id,
      });

      await useChatStore.getState().sendMessage("Hello");

      expect(sentModel()?.reasoning).toBe(false);
      // A stale stored effort must not resurrect reasoning on a plain model.
      expect(sentOptions()?.reasoning).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Context files injected into system prompt (via sendMessage)
  // -----------------------------------------------------------------------
  describe("context file injection", () => {
    beforeEach(() => {
      mockGetActiveModels.mockReturnValue([
        { id: "claude-sonnet-4-20250514", name: "Sonnet", provider: "anthropic" },
      ]);
      mockGetModel.mockReturnValue({
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet",
        api: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
      });
      mockSettingsGetState.mockReturnValue({
        apiKeys: { anthropic: "sk-test" },
        localLLM: { enabled: false, provider: "lmstudio", baseUrl: "", model: "" },
        guardrailsConfig: {},
        selectedModels: [],
        defaultModel: "claude-sonnet-4-20250514",
      });
      mockStreamSimple.mockReturnValue(
        (async function* () {
          yield { type: "text_delta", delta: "Response" };
        })(),
      );
    });

    it("sends message successfully when context files are attached", async () => {
      const conv = makeConversation({ id: "c1" });
      useChatStore.setState({
        conversations: [conv],
        currentConversationId: "c1",
        contextFiles: [{ path: "/test.ts", name: "test.ts", content: "const x = 1;" }],
      });

      await useChatStore.getState().sendMessage("Explain this");
      // Should complete without errors
      expect(useChatStore.getState().isStreaming).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple conversations isolation
  // -----------------------------------------------------------------------
  describe("conversation isolation", () => {
    it("creating multiple conversations preserves all of them", async () => {
      await useChatStore.getState().createConversation();
      await useChatStore.getState().createConversation();
      await useChatStore.getState().createConversation();
      expect(useChatStore.getState().conversations).toHaveLength(3);
    });

    it("each conversation has a unique id", async () => {
      await useChatStore.getState().createConversation();
      await useChatStore.getState().createConversation();
      const ids = useChatStore.getState().conversations.map((c) => c.id);
      expect(new Set(ids).size).toBe(2);
    });

    it("deleting one conversation does not affect others", async () => {
      const c1 = makeConversation({ id: "c1", messages: [makeMessage({ content: "msg1" })] });
      const c2 = makeConversation({ id: "c2", messages: [makeMessage({ content: "msg2" })] });
      const c3 = makeConversation({ id: "c3", messages: [makeMessage({ content: "msg3" })] });
      useChatStore.setState({ conversations: [c1, c2, c3], currentConversationId: "c2" });

      await useChatStore.getState().deleteConversation("c2");

      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0].messages[0].content).toBe("msg1");
      expect(state.conversations[1].messages[0].content).toBe("msg3");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    it("can handle conversations with many messages", () => {
      const messages = Array.from({ length: 100 }, (_, i) =>
        makeMessage({ id: `msg-${i}`, content: `Message ${i}` }),
      );
      const conv = makeConversation({ id: "c1", messages });
      useChatStore.setState({ conversations: [conv], currentConversationId: "c1" });

      const current = useChatStore.getState().getCurrentConversation();
      expect(current?.messages).toHaveLength(100);
    });

    it("handles empty title in rename", async () => {
      const conv = makeConversation({ id: "c1", title: "Old Title" });
      useChatStore.setState({ conversations: [conv] });
      await useChatStore.getState().renameChat("c1", "");
      expect(useChatStore.getState().conversations[0].title).toBe("");
    });

    it("handles special characters in folder names", async () => {
      await useChatStore.getState().createFolder("Folder & <Special> \"Chars\"");
      expect(mockCreateChatFolder).toHaveBeenCalledWith("Folder & <Special> \"Chars\"", undefined);
    });

    it("handles rapid state mutations", () => {
      useChatStore.getState().setModel("a");
      useChatStore.getState().setModel("b");
      useChatStore.getState().setModel("c");
      expect(useChatStore.getState().model).toBe("c");
    });

    it("handles concurrent folder toggles", () => {
      useChatStore.getState().toggleFolderExpansion("f1");
      useChatStore.getState().toggleFolderExpansion("f2");
      useChatStore.getState().toggleFolderExpansion("f3");
      useChatStore.getState().toggleFolderExpansion("f1"); // untoggle f1
      const expanded = useChatStore.getState().expandedFolders;
      expect(expanded.has("f1")).toBe(false);
      expect(expanded.has("f2")).toBe(true);
      expect(expanded.has("f3")).toBe(true);
    });
  });
});
