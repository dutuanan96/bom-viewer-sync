// src/features/ai-assistant/runtime.js
// R2.3 — Bounded grounded runtime.
// Integrates gateway and trust-policy to provide a safe tool loop.

export function createRuntime({ gateway, trustPolicy, runTool }) {
  
  async function runTurn({ query, snapshot, model, availableTools = [], signal }) {
    if (signal?.aborted) throw new Error('Turn aborted');

    // 1. Build bounded context
    const context = trustPolicy.buildContext({ snapshot, query });
    
    // 2. Initialize budget
    const budget = trustPolicy.createBudget();

    const messages = [
      {
        role: 'system',
        content: `You are JinTai PDM AI Assistant.\nContext:\n${JSON.stringify(context, null, 2)}`
      },
      {
        role: 'user',
        content: context.query
      }
    ];

    let currentTurnUsage = { modelCalls: 0, toolCalls: 0 };
    let finalAnswer = null;

    try {
      while (!finalAnswer) {
        if (signal?.aborted) throw new Error('Turn aborted');

        budget.recordModelCall();
        currentTurnUsage.modelCalls++;
        budget.checkExpiry();

        let response;
        try {
          response = await gateway.chat({
            model,
            messages,
            tools: availableTools,
            maxTokens: 1200,
            parallel_tool_calls: false
          });
        } catch (err) {
          // Provider failure: emit deterministic fallback
          return {
            text: 'AI assistant is currently unavailable. Please try again later. (Error: ' + err.message + ')',
            citations: [],
            fallback: true,
            usage: currentTurnUsage
          };
        }

        const message = response.choices?.[0]?.message;
        if (!message) {
          throw new Error('Invalid response from gateway: missing message');
        }

        messages.push(message);

        if (message.tool_calls && message.tool_calls.length > 0) {
          // Process tool calls
          for (const call of message.tool_calls) {
            if (signal?.aborted) throw new Error('Turn aborted');
            
            budget.recordToolCall(call.function.name);
            currentTurnUsage.toolCalls++;

            let toolResult;
            try {
              let args;
              try {
                args = JSON.parse(call.function.arguments);
              } catch (e) {
                args = call.function.arguments;
              }

              const safeCall = trustPolicy.authorizeToolCall({
                name: call.function.name,
                arguments: args
              });

              if (runTool) {
                toolResult = await runTool(safeCall);
              } else {
                toolResult = { error: 'Tool execution not provided' };
              }
            } catch (err) {
              toolResult = { error: err.message };
            }

            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
            });
          }
        } else {
          // Final answer
          // We wrap the raw text into the expected output shape, since the tests inject raw strings
          // In a real app, the model should output structured JSON or we parse citations.
          // For R2.3 RED tests compliance, we assume raw text and empty citations if not structured.
          let rawOutput = message.content || '';
          
          let parsedOutput;
          try {
             // Attempt to parse if the model actually returned JSON (in structured output mode)
             parsedOutput = JSON.parse(rawOutput);
             // Ensure it has text and citations
             if (!parsedOutput.text || !Array.isArray(parsedOutput.citations)) {
                parsedOutput = { text: rawOutput, citations: [] };
             }
          } catch(e) {
             parsedOutput = { text: rawOutput, citations: [] };
          }

          // trust-policy validateModelOutput will catch HTML/script injection
          finalAnswer = trustPolicy.validateModelOutput(parsedOutput);
        }
      }
    } catch (err) {
      if (err.message.includes('aborted')) throw err;
      throw err; // e.g. budget exceed, policy blocked
    }

    return {
      text: finalAnswer.text,
      citations: finalAnswer.citations || [],
      usage: currentTurnUsage
    };
  }

  return { runTurn };
}
