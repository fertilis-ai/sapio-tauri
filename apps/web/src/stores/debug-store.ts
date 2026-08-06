import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/storage";

interface DebugState {
  logFiles: string[];
  selectedFile: string | null;
  fileContent: string;
  isLoading: boolean;
  error: string | null;

  loadLogFiles: () => Promise<void>;
  selectFile: (filename: string) => Promise<void>;
  refreshContent: () => Promise<void>;
  clearSelectedFile: () => Promise<void>;
}

export const useDebugStore = create<DebugState>()((set, get) => ({
  logFiles: [],
  selectedFile: null,
  fileContent: "",
  isLoading: false,
  error: null,

  loadLogFiles: async () => {
    if (!isTauri()) return;
    try {
      const files = await invoke<string[]>("list_log_files");
      set({ logFiles: files });
    } catch (error) {
      console.warn("[debug-store] Failed to list log files:", error);
    }
  },

  selectFile: async (filename: string) => {
    if (!isTauri()) return;
    set({ selectedFile: filename, isLoading: true, error: null });
    try {
      const content = await invoke<string>("read_log_file", { filename });
      set({ fileContent: content, isLoading: false, error: null });
    } catch (error) {
      console.warn("[debug-store] Failed to read log file:", error);
      // Keep this distinct from an empty file — otherwise a read failure looks
      // identical to a log with no content.
      set({ fileContent: "", isLoading: false, error: String(error) });
    }
  },

  refreshContent: async () => {
    const { selectedFile } = get();
    if (!selectedFile || !isTauri()) return;
    try {
      const content = await invoke<string>("read_log_file", { filename: selectedFile });
      set({ fileContent: content, error: null });
    } catch (error) {
      console.warn("[debug-store] Failed to refresh log file:", error);
      set({ error: String(error) });
    }
  },

  clearSelectedFile: async () => {
    const { selectedFile } = get();
    if (!selectedFile || !isTauri()) return;
    try {
      await invoke("clear_log_file", { filename: selectedFile });
      set({ fileContent: "", error: null });
    } catch (error) {
      console.warn("[debug-store] Failed to clear log file:", error);
    }
  },
}));
