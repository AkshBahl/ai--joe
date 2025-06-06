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

    let thread;
    if (threadId) {
      console.log("Attempting to retrieve existing thread:", threadId);
      try {
        thread = await openai.beta.threads.retrieve(threadId);
        console.log("Successfully retrieved thread:", thread.id);
      } catch (retrieveError) {
        console.error("Error retrieving thread:", retrieveError);
        // If thread retrieval fails, create a new one
        console.log("Creating new thread due to retrieval error");
        thread = await openai.beta.threads.create();
      }
    } else {
      console.log("No threadId provided, creating new thread");
      thread = await openai.beta.threads.create();
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

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: lastUserMessage.content,
    });

    console.log("Creating run for thread:", thread.id);
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
    });

    console.log("Run created:", {
      runId: run.id,
      status: run.status,
      threadId: thread.id,
    });

    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (["queued", "in_progress"].includes(runStatus.status)) {
      console.log("Run status:", runStatus.status);
      await new Promise(res => setTimeout(res, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    console.log("Run completed with status:", runStatus.status);

    if (runStatus.status === "completed") {
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
    throw err; // Throw the original error to preserve details
  }
}
