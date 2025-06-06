"use client";

import { useState, useCallback, useEffect } from "react";
import type { Message } from "ai";
import { v4 as uuidv4 } from "uuid";
import { generateChatResponse } from "@/app/actions/chat-actions"; // ✅ matches your file

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatThreadId') || undefined;
    }
    return undefined;
  });
  // ✅ memory per refresh
  const [isLoading, setIsLoading] = useState(false);
  const [lastCompletedAssistantMessage, setLastCompletedAssistantMessage] = useState<Message | null>(null);

  // Update localStorage when threadId changes
  useEffect(() => {
    if (threadId) {
      localStorage.setItem('chatThreadId', threadId);
    } else {
      localStorage.removeItem('chatThreadId');
    }
  }, [threadId]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: input.trim(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      const result = await generateChatResponse(updatedMessages, threadId);

      if (result?.text) {
        const assistantMessage: Message = {
          id: uuidv4(),
          role: "assistant",
          content: result.text,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setLastCompletedAssistantMessage(assistantMessage);
      }

      if (result?.threadId) {
        setThreadId(result.threadId); // This will now persist to localStorage
      }
    } catch (err) {
      console.error("Assistant error:", err);
      // If there's an error, clear the threadId to start fresh
      setThreadId(undefined);
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: "assistant",
          content: "Something went wrong. Starting a new conversation.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, messages, threadId]);

  const handleStop = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Add a function to reset the chat
  const resetChat = useCallback(() => {
    setMessages([]);
    setThreadId(undefined);
    setLastCompletedAssistantMessage(null);
  }, []);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    handleStop,
    isLoading,
    lastCompletedAssistantMessage,
    threadId,
    resetChat, // Export the reset function
  };
}
