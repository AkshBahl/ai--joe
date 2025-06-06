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
      const storedThreadId = localStorage.getItem('chatThreadId');
      console.log("Initializing threadId from localStorage:", storedThreadId);
      return storedThreadId || undefined;
    }
    return undefined;
  });
  // ✅ memory per refresh
  const [isLoading, setIsLoading] = useState(false);
  const [lastCompletedAssistantMessage, setLastCompletedAssistantMessage] = useState<Message | null>(null);

  // Update localStorage when threadId changes
  useEffect(() => {
    console.log("threadId changed:", threadId);
    if (threadId) {
      localStorage.setItem('chatThreadId', threadId);
      console.log("Stored threadId in localStorage:", threadId);
    } else {
      localStorage.removeItem('chatThreadId');
      console.log("Removed threadId from localStorage");
    }
  }, [threadId]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    console.log("Starting chat submission with threadId:", threadId);

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
      console.log("Making API request with:", {
        threadId,
        messageCount: updatedMessages.length,
      });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: updatedMessages,
          threadId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API request failed:", {
          status: response.status,
          statusText: response.statusText,
          errorData,
        });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newThreadId = response.headers.get('X-Thread-Id');
      console.log("Received threadId from response:", newThreadId);

      if (newThreadId) {
        console.log("Updating threadId from", threadId, "to", newThreadId);
        setThreadId(newThreadId);
      } else {
        console.warn("No threadId received in response headers");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        console.error("No reader available in response");
        throw new Error('No reader available');
      }

      let responseText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        responseText += new TextDecoder().decode(value);
      }

      console.log("Received response text length:", responseText.length);

      if (responseText) {
        const assistantMessage: Message = {
          id: uuidv4(),
          role: "assistant",
          content: responseText,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setLastCompletedAssistantMessage(assistantMessage);
      } else {
        console.warn("Received empty response text");
      }
    } catch (err: any) {
      console.error("Chat submission error:", {
        error: err,
        message: err?.message,
        threadId,
      });
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
    console.log("Resetting chat, clearing threadId:", threadId);
    setMessages([]);
    setThreadId(undefined);
    setLastCompletedAssistantMessage(null);
  }, [threadId]);

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
