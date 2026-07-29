const FORBIDDEN_HTML_PATTERN = /<(?!tool_call|tool_name|\/tool_call|\/tool_name|arguments|\/arguments|productCode|\/productCode|color|\/color|query|\/query|stt|\/stt|quantity|\/quantity)[a-zA-Z]/i;

const text = `<tool_call>
<tool_name>search_pdm</tool_name>
<arguments>
<productCode>LGS433</productCode>
<color>复古色</color>
<query>thùng giấy 1185x330x110mm 纸护角 50x50x100mm 泡沫 20kg,320x100x8mm 泡沫 16kg,925x295x10mm 纸卡 1100310ZK</query>
</arguments>
</tool_call>`;

console.log('Regex matched?', FORBIDDEN_HTML_PATTERN.test(text));
if (FORBIDDEN_HTML_PATTERN.test(text)) {
  console.log('Matched part:', text.match(FORBIDDEN_HTML_PATTERN));
}
