import { routePdmIntent } from './src/features/ai-assistant/intent-router.js';
import { ALLOWED_TOOLS } from './src/features/ai-assistant/contracts.js';

const tools = Array.from(ALLOWED_TOOLS);
const firstQuery = '\u5e2e\u6211\u770b\u4e00\u4e0bLGS723\u548cLGS733\u6709\u4ec0\u4e48\u94c1\u4ef6\u5171\u7528';
const followUp = '\u5de6/\u53f3\u4fa7\u6846\u5171\u7528\u4e3a\u4ec0\u4e48\u4f60\u6709\u7edf\u8ba1\u5462\uff1f\uff0c\u8fd8\u6709\u591a\u7684\u5176\u4ed6';

console.log("FIRST QUERY:");
const r1 = routePdmIntent({ query: firstQuery, availableTools: tools });
console.log(r1);

console.log("FOLLOW UP:");
const r2 = routePdmIntent({ 
  query: followUp, 
  history: [
    { role: 'user', content: firstQuery },
    { role: 'assistant', content: '...' }
  ],
  availableTools: tools 
});
console.log(r2);
