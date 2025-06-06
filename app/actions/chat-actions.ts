"use server";

import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistantId = process.env.OPENAI_ASSISTANT_ID!;

export async function generateChatResponse(messages: any[], threadId?: string) {
  try {
    console.log("Starting generateChatResponse with:", {
      threadId,
      messageCount: messages.length,
      assistantId,
      hasApiKey: !!process.env.OPENAI_API_KEY,
    });

    // Validate threadId if provided
    if (threadId && !threadId.startsWith('thread_')) {
      console.warn("Invalid threadId format:", threadId);
      threadId = undefined; // Reset to undefined if invalid format
    }

    let thread;
    try {
      if (threadId) {
        console.log("Attempting to retrieve existing thread:", threadId);
        thread = await openai.beta.threads.retrieve(threadId);
        console.log("Successfully retrieved thread:", thread.id);
      } else {
        console.log("Creating new thread");
        thread = await openai.beta.threads.create();
        console.log("Created new thread:", thread.id);
      }
    } catch (threadError: any) {
      console.error("Thread operation failed:", {
        error: threadError,
        message: threadError?.message,
        code: threadError?.code,
      });
      
      // If there's any error with the thread, create a new one
      console.log("Creating new thread after error");
      thread = await openai.beta.threads.create();
      console.log("Created new thread after error:", thread.id);
    }

    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (!lastUserMessage) {
      console.error("No user message found in messages:", messages);
      throw new Error("No user message found.");
    }

    console.log("Adding message to thread:", {
      threadId: thread.id,
      messageContent: lastUserMessage.content.substring(0, 100) + "...",
    });

    try {
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: lastUserMessage.content,
      });
    } catch (messageError: any) {
      console.error("Failed to add message to thread:", {
        error: messageError,
        message: messageError?.message,
        code: messageError?.code,
      });
      throw new Error("Failed to add message to thread");
    }

    console.log("Creating run for thread:", thread.id);
    let run;
    try {
      run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId,
      });
      console.log("Run created:", {
        runId: run.id,
        status: run.status,
        threadId: thread.id,
      });
    } catch (runError: any) {
      console.error("Failed to create run:", {
        error: runError,
        message: runError?.message,
        code: runError?.code,
      });
      throw new Error("Failed to create run");
    }

    let runStatus;
    try {
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      while (["queued", "in_progress"].includes(runStatus.status)) {
        console.log("Run status:", runStatus.status);
        await new Promise(res => setTimeout(res, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      }
      console.log("Run completed with status:", runStatus.status);
    } catch (statusError: any) {
      console.error("Failed to get run status:", {
        error: statusError,
        message: statusError?.message,
        code: statusError?.code,
      });
      throw new Error("Failed to get run status");
    }

    if (runStatus.status === "completed") {
      try {
        const threadMessages = await openai.beta.threads.messages.list(thread.id);
        const lastMessage = threadMessages.data.find(m => m.role === "assistant");
        const textContent = lastMessage?.content.find(c => c.type === "text");

        if (!textContent || textContent.type !== "text") {
          console.error("No valid text response found in:", lastMessage);
          throw new Error("No valid text response found.");
        }

        console.log("Successfully generated response for thread:", thread.id);
        return {
          text: textContent.text.value,
          threadId: thread.id,
        };
      } catch (messageError: any) {
        console.error("Failed to get messages:", {
          error: messageError,
          message: messageError?.message,
          code: messageError?.code,
        });
        throw new Error("Failed to get messages");
      }
    } else {
      console.error("Run ended with unexpected status:", runStatus.status);
      throw new Error(`Run ended with status: ${runStatus.status}`);
    }
  } catch (err: any) {
    console.error("generateChatResponse error:", {
      error: err,
      message: err?.message,
      status: err?.status,
      code: err?.code,
      type: err?.type,
    });
    // Instead of throwing the original error, throw a more user-friendly one
    throw new Error("Failed to generate response. Please try again.");
  }
}
