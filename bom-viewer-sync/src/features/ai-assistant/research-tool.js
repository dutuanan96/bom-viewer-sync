// src/features/ai-assistant/research-tool.js
// R3 — Default-on Research
// Provides open-web research explicitly as a native tool (`search_web`). 
// Fallbacks gracefully if search fails.

export function createResearchTool({ fetchImpl = globalThis.fetch } = {}) {
  async function search(query) {
    try {
      const url = new URL('/api/v1/search', 'http://localhost');
      url.searchParams.set('q', query);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
      
      const response = await fetchImpl(url.toString(), {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const data = await response.json();
      return {
        evidence: {
          id: 'web_' + Date.now(),
          type: 'web_search',
          query,
          results: data.results || []
        }
      };
    } catch (err) {
      // Isolate failure and return fallback evidence
      return {
        evidence: {
          id: 'web_error_' + Date.now(),
          type: 'web_search',
          query,
          error: 'Web search is currently unavailable. Falling back to local knowledge.',
          details: err.message
        }
      };
    }
  }

  return { search };
}
